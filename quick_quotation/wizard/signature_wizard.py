from odoo import models, fields, api

class QuickQuotationSignatureWizard(models.TransientModel):
    _name = 'quick_quotation.signature.wizard'
    _description = 'Signature Wizard for Quick Quotation'

    template_id = fields.Many2one('sale.order.template', string='Quotation Template', required=True)
    version = fields.Selection([
        ('good', 'Good'),
        ('better', 'Better'),
        ('best', 'Best')
    ], string='Version', required=True)
    
    partner_id = fields.Many2one('res.partner', string='Customer', required=True)
    signed_by = fields.Char(string='Signed By', required=True)
    signature = fields.Binary(string='Signature', required=True)

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        if 'partner_id' in res and ('signed_by' not in res or not res['signed_by']):
            partner = self.env['res.partner'].browse(res['partner_id'])
            if partner and not partner.is_company:
                res['signed_by'] = partner.name
        return res

    @api.onchange('partner_id')
    def _onchange_partner_id(self):
        if self.partner_id and not self.partner_id.is_company:
            self.signed_by = self.partner_id.name


    def action_confirm(self):
        self.ensure_one()
        template = self.template_id
        
        # Create quote
        order = self.env['sale.order'].create({
            'partner_id': self.partner_id.id,
            'sale_order_template_id': template.id,
            'signed_by': self.signed_by,
            'signature': self.signature,
            'require_signature': True,
        })
        
        # Initialize default values from template
        order._onchange_sale_order_template_id()
        
        # Remove lines added by onchange, we will add only the selected version
        order.order_line.unlink()
        
        template_lines = self.env['sale.order.template.line'].search([
            ('sale_order_template_id', '=', template.id),
            ('version', '=', self.version)
        ], order='sequence')
        
        for t_line in template_lines:
            order_line = self.env['sale.order.line'].create({
                'order_id': order.id,
                'name': t_line.name or (t_line.product_id and t_line.product_id.display_name) or '/',
                'product_id': t_line.product_id.id,
                'product_uom_qty': t_line.product_uom_qty,
                'product_uom_id': t_line.product_uom_id.id,
                'display_type': t_line.display_type,
                'sequence': t_line.sequence,
            })
            if order_line.product_id:
                order_line._compute_price_unit()
                order_line._compute_tax_ids()
                
        # Confirm the order immediately since it's signed (moves state to 'sale')
        order.action_confirm()

        # Return action to open the confirmed sale order portal view
        return {
            'type': 'ir.actions.act_url',
            'url': order.get_portal_url(),
            'target': 'self',
        }
