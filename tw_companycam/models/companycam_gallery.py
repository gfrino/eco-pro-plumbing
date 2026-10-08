# -*- coding: utf-8 -*-
import uuid

from odoo import _, api, fields, models


class CompanycamGallery(models.Model):
    _name = 'companycam.gallery'
    _description = 'Shared Photo Gallery'
    _inherit = ['mail.thread']
    _order = 'create_date desc, id desc'

    name = fields.Char(string='Gallery name', required=True, tracking=True)
    project_id = fields.Many2one('project.project', string='Project', index=True, ondelete='cascade')
    company_id = fields.Many2one(
        'res.company', compute='_compute_company_id', store=True, index=True,
        default=lambda self: self.env.company)
    photo_ids = fields.Many2many(
        'companycam.photo', string='Photos and videos',
        domain="[('project_id', '=', project_id)] if project_id else []")
    photo_count = fields.Integer(compute='_compute_photo_count')
    intro = fields.Text(
        string='Message', translate=True,
        help='Short text shown at the top of the shared page, e.g. for the insurance adjuster.')
    show_details = fields.Boolean(
        string='Show date, time and location', default=True,
        help='Show when and where each photo was taken on the shared page.')
    expiry_date = fields.Date(string='Link valid until', help='Leave empty for a link that never expires.')
    access_token = fields.Char(
        required=True, copy=False, index=True, readonly=True,
        default=lambda self: uuid.uuid4().hex, groups='tw_companycam.group_companycam_user')
    share_url = fields.Char(string='Link to share', compute='_compute_share_url')
    view_count = fields.Integer(string='Views', readonly=True, copy=False)
    active = fields.Boolean(default=True)

    @api.depends('project_id.company_id')
    def _compute_company_id(self):
        for gallery in self:
            gallery.company_id = gallery.project_id.company_id or gallery.company_id or self.env.company

    @api.depends('photo_ids')
    def _compute_photo_count(self):
        for gallery in self:
            gallery.photo_count = len(gallery.photo_ids)

    @api.depends('access_token')
    def _compute_share_url(self):
        base_url = self.get_base_url()
        for gallery in self:
            gallery.share_url = f'{base_url}/companycam/g/{gallery.access_token}' if gallery.access_token else False

    def _is_public_valid(self):
        self.ensure_one()
        return self.active and (not self.expiry_date or self.expiry_date >= fields.Date.context_today(self))

    def action_open_public_page(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_url', 'url': self.share_url, 'target': 'new'}

    def action_regenerate_link(self):
        for gallery in self:
            gallery.access_token = uuid.uuid4().hex
        self.message_post(body=_('A new link was created; the previous link no longer works.'))

    def action_print_report(self):
        self.ensure_one()
        return self.env.ref('tw_companycam.action_report_companycam_photos').report_action(self.photo_ids)
