from odoo import models, fields, api
from datetime import timedelta
import pytz
import urllib.parse

class Intervento(models.Model):
    _name = 'interventi.intervento'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Job Request'
    _order = 'date desc'

    name = fields.Char("Reference", required=True, default="New Job Request")
    partner_id = fields.Many2one('res.partner', string='Customer', required=True)
    user_id = fields.Many2one('res.users', string='Assigned Employee', default=lambda self: self.env.user)
    date = fields.Datetime('Start', default=fields.Datetime.now, required=True)
    date_end = fields.Datetime('End', required=True, default=lambda self: fields.Datetime.now() + timedelta(hours=1))
    is_whole_day = fields.Boolean('Whole Day', default=False)
    slot_ids = fields.One2many('interventi.intervento.slot', 'intervento_id', string='Slots', copy=False)
    duration = fields.Float('Duration (Hours)', compute='_compute_duration', inverse='_inverse_duration', store=True)
    sale_order_id = fields.Many2one('sale.order', string='Sale Order')
    notes = fields.Text('Notes')
    google_maps_link = fields.Char('Google Maps', compute='_compute_google_maps_link')
    state = fields.Selection([
        ('in_progress', 'In Progress'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled')
    ], string='Status', default='in_progress', tracking=True)
    color = fields.Integer(string='Color', compute='_compute_color', store=True)

    @api.depends('state')
    def _compute_color(self):
        for record in self:
            if record.state == 'done':
                record.color = 10
            elif record.state == 'cancelled':
                record.color = 1
            else:
                record.color = 3

    @api.depends('partner_id.street', 'partner_id.city', 'partner_id.zip', 'partner_id.country_id')
    def _compute_google_maps_link(self):
        for record in self:
            address_parts = []
            if record.partner_id:
                if record.partner_id.street:
                    address_parts.append(record.partner_id.street)
                if record.partner_id.city:
                    address_parts.append(record.partner_id.city)
                if record.partner_id.zip:
                    address_parts.append(record.partner_id.zip)
                if record.partner_id.country_id:
                    address_parts.append(record.partner_id.country_id.name)
            
            if address_parts:
                query = '+'.join([str(p).replace(' ', '+') for p in address_parts])
                record.google_maps_link = f"https://www.google.com/maps/search/?api=1&query={query}"
            else:
                record.google_maps_link = False

    def action_create_full_quotation(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Quotation',
            'res_model': 'sale.order',
            'view_mode': 'form',
            'context': {
                'default_partner_id': self.partner_id.id,
            }
        }

    @api.depends('date', 'date_end')
    def _compute_duration(self):
        for record in self:
            if record.date and record.date_end:
                diff = record.date_end - record.date
                record.duration = diff.total_seconds() / 3600.0
            else:
                record.duration = 1.0

    def _inverse_duration(self):
        for record in self:
            if record.date and record.duration:
                record.date_end = record.date + timedelta(hours=record.duration)

    @api.onchange('date')
    def _onchange_date(self):
        if self.date and not self.date_end:
            self.date_end = self.date + timedelta(hours=1)
        elif self.date and self.date_end and self.date_end < self.date:
            self.date_end = self.date + timedelta(hours=1)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', "New Job Request") in ["New Job Request", "Nuovo Intervento", "New Intervention", ""] or vals.get('name', '').startswith("Job Request -"):
                if 'partner_id' in vals:
                    partner = self.env['res.partner'].browse(vals['partner_id'])
                    vals['name'] = partner.name
        records = super().create(vals_list)
        records._sync_slots()
        return records

    def action_view_sale_order(self):
        self.ensure_one()
        if self.sale_order_id:
            return {
                'type': 'ir.actions.act_window',
                'name': 'Quotation',
                'res_model': 'sale.order',
                'view_mode': 'form',
                'views': [(False, 'form')],
                'res_id': self.sale_order_id.id,
            }

    def write(self, vals):
        res = super().write(vals)
        if not self.env.context.get('skip_sync_slots'):
            if 'date' in vals or 'date_end' in vals or 'user_id' in vals or 'is_whole_day' in vals:
                self._sync_slots(vals)
        return res

    def _sync_slots(self, vals=None):
        for record in self:
            existing_user_mapping = {}
            if not vals or 'user_id' not in vals:
                for slot in record.slot_ids:
                    if slot.date_start and slot.user_id:
                        existing_user_mapping[slot.date_start.date().isoformat()] = slot.user_id.id
            
            record.slot_ids.unlink()
            if not record.date or not record.date_end:
                continue
                
            def create_slot(start, end):
                day_str = start.date().isoformat() if hasattr(start, 'date') else start[:10] if isinstance(start, str) else None
                uid = existing_user_mapping.get(day_str, record.user_id.id)
                self.env['interventi.intervento.slot'].create({
                    'intervento_id': record.id,
                    'date_start': start,
                    'date_end': end,
                    'user_id': uid,
                })

            if record.is_whole_day:
                create_slot(record.date, record.date_end)
            else:
                company = record.env.company
                calendar = company.resource_calendar_id
                if calendar:
                    start_dt = pytz.utc.localize(record.date)
                    end_dt = pytz.utc.localize(record.date_end)
                    try:
                        intervals = calendar._work_intervals_batch(start_dt, end_dt)[False]
                        if not intervals:
                            raise ValueError("No working intervals found")
                        for start, stop, attendance in intervals:
                            create_slot(start.astimezone(pytz.utc).replace(tzinfo=None), stop.astimezone(pytz.utc).replace(tzinfo=None))
                    except Exception:
                        create_slot(record.date, record.date_end)
                else:
                    create_slot(record.date, record.date_end)

    @api.model
    def get_gantt_data(self, start_date_str, end_date_str, mode):
        domain = ['|', '&', ('date_start', '>=', start_date_str), ('date_start', '<', end_date_str), '&', ('date_end', '>', start_date_str), ('date_start', '<', start_date_str)]
        slots = self.env['interventi.intervento.slot'].search_read(domain, ['id', 'name', 'date_start', 'date_end', 'duration', 'user_id', 'partner_id', 'state', 'intervento_id'])
        
        interventions = []
        for slot in slots:
            slot['date'] = slot['date_start']
            interventions.append(slot)
        
        # Get internal users
        users = self.env['res.users'].search([('share', '=', False)])
        
        employees_data = []
        company_calendar = self.env.company.resource_calendar_id
        
        start_dt = fields.Datetime.from_string(start_date_str)
        end_dt = fields.Datetime.from_string(end_date_str)
        
        if company_calendar:
            capacity_hours = company_calendar.get_work_hours_count(start_dt, end_dt)
        else:
            capacity_hours = 40.0
            
        for user in users:
            allocated = sum([inv['duration'] for inv in interventions if inv.get('user_id') and inv['user_id'][0] == user.id])
            if allocated > 0:
                employees_data.append({
                    'id': user.id,
                    'name': user.name,
                    'allocated_hours': allocated,
                    'capacity_hours': capacity_hours,
                    'color': user.color
                })
            
        employees_data.sort(key=lambda x: x['name'])
        
        return {
            'interventions': interventions,
            'employees': employees_data
        }
