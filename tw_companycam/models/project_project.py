# -*- coding: utf-8 -*-
import base64
import uuid

from odoo import _, api, fields, models


class ProjectProject(models.Model):
    _inherit = 'project.project'

    companycam_photo_ids = fields.One2many('companycam.photo', 'project_id', string='Job site photos')
    companycam_photo_count = fields.Integer(string='Photos', compute='_compute_companycam_stats')
    companycam_video_count = fields.Integer(string='Videos', compute='_compute_companycam_stats')
    companycam_last_capture = fields.Datetime(string='Last capture', compute='_compute_companycam_stats')
    companycam_cover_id = fields.Many2one('companycam.photo', compute='_compute_companycam_stats')
    companycam_address = fields.Char(
        string='Job site address', compute='_compute_companycam_address', store=True, readonly=False,
        help="Filled in from the customer's address; change it if the job site is somewhere else.")
    companycam_timeline_enabled = fields.Boolean(
        string='Live timeline link', copy=False,
        help='Anyone with the link can follow the progress of this job with all its photos, in real time.')
    companycam_timeline_token = fields.Char(
        copy=False, index=True, groups='tw_companycam.group_companycam_user')
    companycam_timeline_url = fields.Char(string='Timeline link', compute='_compute_companycam_timeline_url')
    companycam_qr_url = fields.Char(string='QR code link', compute='_compute_companycam_timeline_url')

    def _compute_companycam_stats(self):
        Photo = self.env['companycam.photo']
        stats = {
            (project, media_type): (count, last)
            for project, media_type, count, last in Photo._read_group(
                [('project_id', 'in', self.ids)], ['project_id', 'media_type'],
                ['__count', 'captured_at:max'])
        }
        covers = dict(Photo._read_group(
            [('project_id', 'in', self.ids), ('media_type', '=', 'photo')], ['project_id'], ['id:max']))
        for project in self:
            photos, last_photo = stats.get((project, 'photo'), (0, False))
            videos, last_video = stats.get((project, 'video'), (0, False))
            project.companycam_photo_count = photos
            project.companycam_video_count = videos
            project.companycam_last_capture = max(filter(None, [last_photo, last_video]), default=False)
            project.companycam_cover_id = Photo.browse(covers[project]) if covers.get(project) else False

    @api.depends('partner_id')
    def _compute_companycam_address(self):
        for project in self:
            if project.partner_id and not project.companycam_address:
                partner = project.partner_id
                parts = [partner.street, partner.street2, ' '.join(filter(None, [partner.zip, partner.city]))]
                project.companycam_address = ', '.join(filter(None, parts)) or False

    @api.depends('companycam_timeline_enabled')
    def _compute_companycam_timeline_url(self):
        base_url = self.get_base_url()
        for project in self:
            token = project.sudo().companycam_timeline_token
            project.companycam_timeline_url = (
                f'{base_url}/companycam/t/{token}'
                if project.companycam_timeline_enabled and token else False)
            project.companycam_qr_url = f'{base_url}/companycam/p/{project.id}' if project.id else False

    def write(self, vals):
        if vals.get('companycam_timeline_enabled'):
            for project in self.sudo().filtered(lambda p: not p.companycam_timeline_token):
                project.companycam_timeline_token = uuid.uuid4().hex
        return super().write(vals)

    def companycam_qr_data_uri(self):
        """QR code as inline PNG, so the PDF never depends on fetching an image URL."""
        self.ensure_one()
        png = self.env['ir.actions.report'].barcode('QR', self.companycam_qr_url, width=600, height=600)
        return 'data:image/png;base64,' + base64.b64encode(png).decode()

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------
    def action_companycam_open_camera(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'tw_companycam.camera',
            'name': _('Camera'),
            'target': 'fullscreen',
            'params': {'project_id': self.id},
        }

    def action_companycam_view_photos(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('tw_companycam.action_companycam_photo')
        action.update({
            'name': self.name,
            'domain': [('project_id', '=', self.id)],
            'context': {'default_project_id': self.id, 'search_default_group_by_day': 1},
        })
        return action

    def action_companycam_enable_timeline(self):
        self.write({'companycam_timeline_enabled': True})

    def action_companycam_new_timeline_link(self):
        for project in self.sudo():
            project.companycam_timeline_token = uuid.uuid4().hex

    def action_companycam_print_qr(self):
        return self.env.ref('tw_companycam.action_report_companycam_qr').report_action(self)

    def action_companycam_print_photos(self):
        self.ensure_one()
        return self.env.ref('tw_companycam.action_report_companycam_photos').report_action(
            self.companycam_photo_ids.sorted('captured_at'))
