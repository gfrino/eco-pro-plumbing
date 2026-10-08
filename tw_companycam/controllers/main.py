# -*- coding: utf-8 -*-
import base64
import json
from collections import OrderedDict
from datetime import datetime, timezone

from werkzeug.exceptions import BadRequest, NotFound

from odoo import _, fields, http
from odoo.http import request
from odoo.tools import consteq, format_date

# Binary fields that may be streamed on the public pages
PUBLIC_MEDIA_FIELDS = {'image_512', 'image_1024', 'image_1920', 'image_annotated', 'image_annotated_512', 'video_file'}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


class CompanyCamController(http.Controller):

    # ------------------------------------------------------------------
    # Camera upload (logged-in users)
    # ------------------------------------------------------------------
    @http.route('/companycam/upload', type='http', auth='user', methods=['POST'])
    def companycam_upload(self, project_id=None, media_type='photo', ufile=None, poster=None,
                          captured_at=None, latitude=None, longitude=None, accuracy=None,
                          tag_ids=None, duration=None, dual=None, **kw):
        if not ufile or media_type not in ('photo', 'video'):
            raise BadRequest(_('Nothing to upload.'))
        project = request.env['project.project']
        if project_id and str(project_id).isdigit():
            project = project.browse(int(project_id)).exists()
            if not project:
                raise NotFound()
            project.check_access('read')

        capture_uid = (kw.get('capture_uid') or '')[:64]
        if capture_uid:
            # Offline queue retries must not create duplicates
            existing = request.env['companycam.photo'].search([('capture_uid', '=', capture_uid)], limit=1)
            if existing:
                return self._json({'id': existing.id, 'name': existing.name})

        data = ufile.read()
        if not data or len(data) > MAX_UPLOAD_BYTES:
            raise BadRequest(_('The file is empty or too large.'))

        vals = {
            'project_id': project.id or False,
            'media_type': media_type,
            'captured_at': self._parse_client_datetime(captured_at),
            'latitude': self._to_float(latitude),
            'longitude': self._to_float(longitude),
            'location_accuracy': self._to_float(accuracy),
            'dual_camera': dual in ('1', 'true'),
            'capture_uid': capture_uid or False,
        }
        if tag_ids:
            ids = [int(t) for t in tag_ids.split(',') if t.strip().isdigit()]
            vals['tag_ids'] = [fields.Command.set(request.env['companycam.tag'].browse(ids).exists().ids)]
        if media_type == 'photo':
            vals['image_1920'] = base64.b64encode(data)
        else:
            vals.update({
                'video_file': base64.b64encode(data),
                'video_filename': ufile.filename or 'video.webm',
                'video_mimetype': ufile.mimetype or 'video/webm',
                'video_duration': self._to_float(duration),
            })
            poster_data = poster.read() if poster else b''
            if poster_data:
                vals['image_1920'] = base64.b64encode(poster_data)

        photo = request.env['companycam.photo'].create(vals)
        return self._json({'id': photo.id, 'name': photo.name})

    # ------------------------------------------------------------------
    # QR code target: opens the project in the backend
    # ------------------------------------------------------------------
    @http.route('/companycam/p/<int:project_id>', type='http', auth='user')
    def companycam_project_qr(self, project_id, **kw):
        project = request.env['project.project'].browse(project_id).exists()
        if not project:
            raise NotFound()
        project.check_access('read')
        return request.redirect(f'/odoo/companycam-projects/{project.id}')

    # ------------------------------------------------------------------
    # Public pages
    # ------------------------------------------------------------------
    @http.route('/companycam/g/<string:token>', type='http', auth='public', website=False)
    def companycam_gallery(self, token, **kw):
        gallery = self._get_gallery(token)
        gallery.sudo().view_count += 1
        photos = gallery.photo_ids.sorted('captured_at')
        return request.render('tw_companycam.public_gallery_page', {
            'title': gallery.name,
            'gallery': gallery,
            'project': gallery.project_id,
            'company': gallery.company_id,
            'groups': self._group_by_day(photos),
            'photo_count': len(photos),
            'show_details': gallery.show_details,
            'media_prefix': f'/companycam/m/g/{token}',
        })

    @http.route('/companycam/t/<string:token>', type='http', auth='public', website=False)
    def companycam_timeline(self, token, **kw):
        project = self._get_timeline_project(token)
        photos = project.companycam_photo_ids.sorted('captured_at', reverse=True)
        return request.render('tw_companycam.public_gallery_page', {
            'title': project.name,
            'gallery': False,
            'project': project,
            'company': project.company_id,
            'groups': self._group_by_day(photos),
            'photo_count': len(photos),
            'show_details': True,
            'media_prefix': f'/companycam/m/t/{token}',
        })

    @http.route('/companycam/m/<string:kind>/<string:token>/<int:photo_id>/<string:field>',
                type='http', auth='public', website=False)
    def companycam_media(self, kind, token, photo_id, field, **kw):
        if field not in PUBLIC_MEDIA_FIELDS:
            raise NotFound()
        if kind == 'g':
            allowed = self._get_gallery(token).photo_ids
        elif kind == 't':
            allowed = self._get_timeline_project(token).companycam_photo_ids
        else:
            raise NotFound()
        photo = allowed.filtered(lambda p: p.id == photo_id)
        if not photo:
            raise NotFound()
        stream = request.env['ir.binary']._get_stream_from(photo, field)
        return stream.get_response(max_age=3600)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _get_gallery(self, token):
        gallery = request.env['companycam.gallery'].sudo().search([('access_token', '=', token)], limit=1)
        if not gallery or not consteq(gallery.access_token, token) or not gallery._is_public_valid():
            raise NotFound()
        return gallery

    def _get_timeline_project(self, token):
        project = request.env['project.project'].sudo().search([
            ('companycam_timeline_token', '=', token),
            ('companycam_timeline_enabled', '=', True),
        ], limit=1)
        if not project or not consteq(project.companycam_timeline_token, token):
            raise NotFound()
        return project

    def _group_by_day(self, photos):
        """[(day label, [{'photo', 'time'}])] in the time zone of whoever took the photo."""
        groups = OrderedDict()
        for photo in photos:
            tz = photo.user_id.tz or photo.company_id.partner_id.tz or 'UTC'
            local = fields.Datetime.context_timestamp(photo.with_context(tz=tz), photo.captured_at)
            groups.setdefault(local.date(), []).append({'photo': photo, 'time': local.strftime('%H:%M')})
        return [(format_date(request.env, day, date_format='full'), items) for day, items in groups.items()]

    @staticmethod
    def _json(payload):
        return request.make_response(json.dumps(payload), headers=[('Content-Type', 'application/json')])

    @staticmethod
    def _to_float(value):
        try:
            return float(value) if value not in (None, '', 'null', 'undefined') else 0.0
        except ValueError:
            return 0.0

    @staticmethod
    def _parse_client_datetime(value):
        """Client sends epoch milliseconds (time of capture, also when uploaded later)."""
        try:
            stamp = datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).replace(tzinfo=None)
        except (TypeError, ValueError, OverflowError, OSError):
            return fields.Datetime.now()
        return min(stamp, fields.Datetime.now())
