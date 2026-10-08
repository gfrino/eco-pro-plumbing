from odoo import models

class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _prepare_qbo_api_lib_instance(self, qi_id: int, invoice_id: int, amount: float = None):
        qbo_lib_model = super()._prepare_qbo_api_lib_instance(qi_id, invoice_id, amount)
        
        qi = self.env['quickbooks.integration'].browse(qi_id)
        invoice = self.env['account.move'].browse(invoice_id)
        
        # Check if the generated model ended up with a False value for CustomerRef or VendorRef
        # This happens if the payment's partner has no mapping in QuickBooks.
        ref = qbo_lib_model.CustomerRef if invoice.is_customer_move_type else qbo_lib_model.VendorRef
            
        if not ref or not ref.get('value'):
            # Fallback 1: Try the invoice's exact partner
            fallback_mapping = invoice.partner_id._get_qbo_mapping(qi.id, invoice.qbo_partner_type)
            
            # Fallback 2: Try the invoice's commercial_partner_id (main company)
            if not fallback_mapping:
                fallback_mapping = invoice.partner_id.commercial_partner_id._get_qbo_mapping(qi.id, invoice.qbo_partner_type)
                
            if fallback_mapping and fallback_mapping.qbo_id:
                if invoice.is_customer_move_type:
                    qbo_lib_model.CustomerRef = {'value': fallback_mapping.qbo_id}
                else:
                    qbo_lib_model.VendorRef = {'value': fallback_mapping.qbo_id}

        return qbo_lib_model
