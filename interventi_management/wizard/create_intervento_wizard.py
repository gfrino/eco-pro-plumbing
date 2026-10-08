from odoo import models, fields, api
from datetime import timedelta

class CreateInterventoWizard(models.TransientModel):
    _name = 'create.intervento.wizard'
    _description = 'Create Job Request Wizard'

    partner_id = fields.Many2one('res.partner', string='Customer', required=True)
    user_id = fields.Many2one('res.users', string='Assigned Employee', default=lambda self: self.env.user)
    date = fields.Datetime('Start', default=fields.Datetime.now, required=True)
    date_end = fields.Datetime('End', required=True, default=lambda self: fields.Datetime.now() + timedelta(hours=1))
    is_whole_day = fields.Boolean('Whole Day', default=False)

    @api.onchange('date')
    def _onchange_date(self):
        if self.date and not self.date_end:
            self.date_end = self.date + timedelta(hours=1)
        elif self.date and self.date_end and self.date_end < self.date:
            self.date_end = self.date + timedelta(hours=1)
    notes = fields.Text('Notes')

    def action_create_intervento(self):
        self.ensure_one()
        intervento = self.env['interventi.intervento'].create({
            'partner_id': self.partner_id.id,
            'user_id': self.user_id.id,
            'date': self.date,
            'date_end': self.date_end,
            'is_whole_day': self.is_whole_day,
            'notes': self.notes,
        })
        
        # In Odoo, to open the new record from a wizard that was triggered 
        # on another form, returning an act_window works best.
        return {
            'type': 'ir.actions.act_window',
            'name': 'Job Request created',
            'res_model': 'interventi.intervento',
            'res_id': intervento.id,
            'view_mode': 'form',
            'target': 'current',
        }
