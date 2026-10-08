from odoo import api, models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    @api.model_create_multi
    def create(self, vals_list):
        # New quotations start with the customer's marketing origin when none is given
        Partner = self.env['res.partner']
        for vals in vals_list:
            if not vals.get('partner_id'):
                continue
            partner = Partner.browse(vals['partner_id']).commercial_partner_id
            for fname in ('campaign_id', 'medium_id', 'source_id'):
                if not vals.get(fname) and partner[fname]:
                    vals[fname] = partner[fname].id
        return super().create(vals_list)
