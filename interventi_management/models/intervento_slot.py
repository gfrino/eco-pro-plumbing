from odoo import models, fields, api
from datetime import timedelta

class InterventoSlot(models.Model):
    _name = 'interventi.intervento.slot'
    _description = 'Job Request Slot'
    _order = 'date_start asc'

    intervento_id = fields.Many2one('interventi.intervento', string='Job Request', required=True, ondelete='cascade')
    name = fields.Char(related='intervento_id.name', string='Reference', readonly=True, store=True)
    partner_id = fields.Many2one(related='intervento_id.partner_id', string='Customer', readonly=True, store=True)
    user_id = fields.Many2one('res.users', string='Assigned Employee')
    is_whole_day = fields.Boolean(related='intervento_id.is_whole_day', string='Whole Day', readonly=True, store=True)
    state = fields.Selection(related='intervento_id.state', string='Status', store=True, readonly=False)
    color = fields.Integer(related='user_id.color', string='Color', store=True)
    
    date_start = fields.Datetime('Start Date', required=True)
    date_end = fields.Datetime('End Date', required=True)
    duration = fields.Float('Duration', compute='_compute_duration', store=True)

    @api.depends('date_start', 'date_end')
    def _compute_duration(self):
        for record in self:
            if record.date_start and record.date_end:
                diff = record.date_end - record.date_start
                record.duration = diff.total_seconds() / 3600.0
            else:
                record.duration = 0.0

    def write(self, vals):
        deltas = {}
        for slot in self:
            deltas[slot.id] = {
                'old_start': slot.date_start,
                'old_end': slot.date_end,
            }

        # If JS only sends date_start (drag & drop), adjust date_end to maintain duration
        if 'date_start' in vals and 'date_end' not in vals:
            if len(self) == 1:
                slot = self[0]
                new_start = fields.Datetime.from_string(vals['date_start'])
                if slot.date_start and slot.date_end and new_start:
                    duration_delta = new_start - slot.date_start
                    new_end = slot.date_end + duration_delta
                    vals['date_end'] = new_end.strftime('%Y-%m-%d %H:%M:%S')
                    
        res = super().write(vals)
        
        for slot in self:
            if 'date_start' in vals or 'date_end' in vals or 'user_id' in vals:
                parent = slot.intervento_id
                all_slots = parent.slot_ids
                
                if all_slots:
                    min_date = min(all_slots.mapped('date_start'))
                    max_date = max(all_slots.mapped('date_end'))
                    
                    parent_vals = {
                        'date': min_date,
                        'date_end': max_date
                    }
                    
                    if len(all_slots) <= 1 and 'user_id' in vals:
                        parent_vals['user_id'] = vals['user_id']
                        
                    parent.with_context(skip_sync_slots=True).write(parent_vals)
                    
        return res
