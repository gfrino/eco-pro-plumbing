from odoo import api, fields, models

MARKETING_FIELDS = ('campaign_id', 'medium_id', 'source_id', 'referred')


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    referred = fields.Char(string='Referred By', help="Who referred this customer to us.")

    @api.onchange('partner_id')
    def _onchange_partner_id_eco_marketing(self):
        # Pre-fill the customer's marketing origin as soon as the customer is chosen
        partner = self.partner_id.commercial_partner_id
        for fname in MARKETING_FIELDS:
            if partner[fname] and not self[fname]:
                self[fname] = partner[fname]

    @api.model_create_multi
    def create(self, vals_list):
        # Same for quotations created without the form (API, opportunities, imports)
        Partner = self.env['res.partner']
        for vals in vals_list:
            if not vals.get('partner_id'):
                continue
            partner = Partner.browse(vals['partner_id']).commercial_partner_id
            for fname in MARKETING_FIELDS:
                if not vals.get(fname) and partner[fname]:
                    vals[fname] = partner[fname] if fname == 'referred' else partner[fname].id
        return super().create(vals_list)
