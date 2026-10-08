from odoo import models, fields, api

class SaleOrder(models.Model):
    _inherit = 'sale.order'

    @api.model
    def create_quick_quote(self, template_id, version):
        """
        Creates a new quotation from a template, filtering lines by the selected version.
        :param template_id: int (ID of sale.order.template)
        :param version: str ('good', 'better', 'best')
        :return: dict (action to open the new sale order)
        """
        template = self.env['sale.order.template'].browse(template_id)
        if not template.exists():
            return False

        # Create basic generic quote
        order = self.create({
            'partner_id': self.env.company.partner_id.id, # Placeholder partner to be changed by user
            'sale_order_template_id': template.id,
        })
        
        # Trigger onchange of template to populate defaults like validity and payment terms
        order._onchange_sale_order_template_id()

        # Remove the lines added by standard onchange, we will add only the selected version
        order.order_line.unlink()

        # Find the correct lines on the template based on version
        # The quote_template_versions module added 'good_line_ids', 'better_line_ids', 'best_line_ids'
        # but all of them are sale.order.template.line filtered by 'version'.
        template_lines = self.env['sale.order.template.line'].search([
            ('sale_order_template_id', '=', template.id),
            ('version', '=', version)
        ], order='sequence')

        # Add lines to order
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
            # Trigger product onchange on the line for pricing/taxes
            if order_line.product_id:
                order_line._compute_price_unit()
                order_line._compute_tax_ids()

        # Enforce digital signature
        order.require_signature = True

        # Return action to redirect to the public portal for signature
        return {
            'type': 'ir.actions.act_url',
            'url': order.get_portal_url(),
            'target': 'self',
        }
