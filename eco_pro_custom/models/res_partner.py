from odoo import models, fields, api, _

class ResPartner(models.Model):
    _inherit = 'res.partner'

    type = fields.Selection(selection_add=[
        ('delivery', 'Job Location'),
    ], ondelete={'delivery': 'cascade'})

    @api.depends('parent_id', 'type')
    def _compute_type_address_label(self):
        super(ResPartner, self)._compute_type_address_label()
        for partner in self:
            if partner.type == 'delivery':
                partner.type_address_label = _('Job Location')

    # Marketing origin of the customer (copied from the lead that brought it in)
    campaign_id = fields.Many2one('utm.campaign', string='Campaign', index='btree_not_null',
                                  help="Marketing campaign this customer came from.")
    medium_id = fields.Many2one('utm.medium', string='Medium', index='btree_not_null',
                                help="How this customer reached us, e.g. Google Ads, Email, Phone.")
    source_id = fields.Many2one('utm.source', string='Source', index='btree_not_null',
                                help="Where this customer came from, e.g. Google, Facebook, Yelp.")
    referred = fields.Char(string='Referred By', help="Who referred this customer to us.")
