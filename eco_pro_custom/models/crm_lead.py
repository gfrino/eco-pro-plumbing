from odoo import api, models

MARKETING_FIELDS = ('campaign_id', 'medium_id', 'source_id', 'referred')


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    @api.model_create_multi
    def create(self, vals_list):
        leads = super().create(vals_list)
        leads._eco_copy_marketing_to_partner()
        return leads

    def write(self, vals):
        res = super().write(vals)
        if {'partner_id', *MARKETING_FIELDS} & set(vals):
            self._eco_copy_marketing_to_partner()
        return res

    def _eco_copy_marketing_to_partner(self):
        """Fill the customer's empty marketing fields from the lead.
        Values already set on the customer are never overwritten: the first lead wins."""
        for lead in self.filtered('partner_id'):
            partner = lead.partner_id.sudo()
            vals = {}
            for fname in MARKETING_FIELDS:
                value = lead[fname]
                if value and not partner[fname]:
                    vals[fname] = value.id if fname != 'referred' else value
            if vals:
                partner.write(vals)
