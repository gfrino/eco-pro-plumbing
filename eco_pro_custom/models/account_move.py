from odoo import models, api, _
from odoo.exceptions import UserError, ValidationError

class AccountMove(models.Model):
    _inherit = 'account.move'

    def action_add_cc_fee(self):
        for move in self:
            if move.state != 'draft':
                raise UserError(_("You can only add credit card fees to draft invoices."))
            if move.move_type not in ('out_invoice', 'out_refund'):
                continue
                
            fee_percentage = move.company_id.cc_fee_percentage
            fee_product = move.company_id.cc_fee_product_id
            
            if not fee_product:
                raise UserError(_("Please configure the Credit Card Fee Product in the Accounting Settings."))
                
            fee_amount = move.amount_total * (fee_percentage / 100.0)
            
            if fee_amount <= 0:
                raise UserError(_("The invoice total is zero, cannot add credit card fee."))
            
            move.write({
                'invoice_line_ids': [(0, 0, {
                    'product_id': fee_product.id,
                    'name': f"Credit Card Fee ({fee_percentage}%)",
                    'quantity': 1,
                    'price_unit': fee_amount,
                })]
            })

    def _check_partner_qbo(self):
        try:
            return super()._check_partner_qbo()
        except ValidationError as e:
            # VentorTech might raise ValidationError or UserError
            partner = self.partner_id
            if partner and not partner.is_a_contact_type and partner.commercial_partner_id and partner.commercial_partner_id.is_a_contact_type:
                return True
            raise

    def export_qbo_one(self):
        self.ensure_one()

        if self.is_excluded_from_qbo_sync:
            return self._get_qbo_mapping()

        company = self.company_id
        self = self.with_company(company)

        # Check requirements
        self._check_qbo_requirements()

        qi = company.quickbooks_integration

        # Export main partner if no mapping found
        target_partner = self.partner_id if self.partner_id.is_a_contact_type else self.partner_id.commercial_partner_id
        partner = target_partner._ensure_qbo_currency(self)
        partner_mapping = partner._get_qbo_mapping(qi.id, self.qbo_partner_type)

        if not partner_mapping:
            partner_mapping = partner.export_qbo_one(qi.id, self.qbo_partner_type)
        partner_mapping.ensure_one()

        # Export products if no mapping found
        products = self._get_products_to_qbo_export()
        for product in products:
            product_mapping = product._get_qbo_mapping(qi.id, 'item')

            if not product_mapping:
                product_mapping = product.export_qbo_one(qi.id)
            product_mapping.ensure_one()

        # Export source customer if no mapping found for vendor bill/refund
        if self.is_vendor_move_type:
            partners = self.qbo_invoice_line_ids \
                .mapped('purchase_line_id.sale_line_id.order_id.partner_id')

            for partner in partners._ensure_qbo_currency(self):
                partner_mapping = partner._get_qbo_mapping(qi.id, 'customer')

                if not partner_mapping:
                    partner_mapping = partner.export_qbo_one(qi.id, 'customer')
                partner_mapping.ensure_one()

        # Prepare invoice qbo-lib instance
        qbo_lib_model = self._prepare_qbo_api_lib_instance(qi.id)

        # Export invoice
        from odoo.addons.quickbooks_sync_online.quickbooks_api import QboDuplicateDocumentNumberError
        try:
            mapping = self._export_qbo_one(qi.id, qbo_lib_model)
        except QboDuplicateDocumentNumberError:
            mapping = self._export_qbo_one_after_duplicate_check(qi.id, qbo_lib_model)

        # Mark invoice as excluded from QuickBooks sync
        self.mark_excluded_from_qbo_sync()

        # Export payments if payment sync is enabled
        if qi.enable_payments_sync_out and not self.env.context.get('from_qbo_export_payment'):
            self.reconciled_payment_ids \
                .with_context(qbo_invoice_export_allowed=True) \
                .action_export_to_quickbooks()

        return mapping

    def _prepare_qbo_api_lib_instance(self, qi_id: int):
        qi = self.env['quickbooks.integration'].browse(qi_id)
        qbo_lib_model = self._init_qbo_lib_instance(self.map_type)

        target_partner = self.partner_id if self.partner_id.is_a_contact_type else self.partner_id.commercial_partner_id
        partner = target_partner._ensure_qbo_currency(self)
        qbo_partner = partner._get_qbo_mapping(qi.id, self.qbo_partner_type)

        TAX_EXCLUDED = 'TaxExcluded'
        TAX_INCLUDED = 'TaxIncluded'

        if qi.qb_is_us_company:
            tax_calculation = TAX_EXCLUDED
        else:
            tax_calculation = TAX_INCLUDED if qi.export_invoice_as_tax_included else TAX_EXCLUDED

        qbo_lib_model.GlobalTaxCalculation = tax_calculation

        if self.ref:
            qbo_lib_model.PrivateNote = self.ref

        if self.is_customer_move_type:
            qbo_lib_model.CustomerRef = {
                'value': qbo_partner.qbo_id,
            }
            qbo_lib_model.DepartmentRef = {
                'value': self._get_qbo_department(),
            }
            if self.is_customer_invoice:
                qbo_lib_model.BillEmail = {'Address': target_partner.email or ''}
                qbo_lib_model.AllowOnlineACHPayment = True
                qbo_lib_model.AllowOnlineCreditCardPayment = True

            if self.partner_shipping_id:
                qbo_lib_model.ShipAddr = self.partner_shipping_id._format_to_qbo_address()

        elif self.is_vendor_move_type:
            pay_account = target_partner.property_account_payable_id
            account_rel = pay_account.get_qbo_related_account(qi.id)

            qbo_lib_model.VendorRef = {
                'value': qbo_partner.qbo_id,
            }
            qbo_lib_model.APAccountRef = {
                'name': account_rel.qbo_name,
                'value': account_rel.qbo_id,
            }

        if self.currency_id != qi.currency_id:
            qbo_lib_model.ExchangeRate = self.currency_id.inverse_rate

        qbo_lib_model.DocNumber = self.name
        qbo_lib_model.CurrencyRef = {
            'value': self.currency_id.name,
        }
        if self.invoice_date:
            qbo_lib_model.TxnDate = self.invoice_date.strftime('%Y-%m-%d')

        if self.invoice_date_due and not self.invoice_payment_term_id:
            if self.is_customer_invoice or self.is_vendor_bill:
                qbo_lib_model.DueDate = self.invoice_date_due.strftime('%Y-%m-%d')
        elif self.invoice_payment_term_id:
            if self.is_customer_invoice or self.is_vendor_bill or self.is_customer_refund:
                qbo_rel_term = self.invoice_payment_term_id.get_qbo_related_payment_term(qi.id)
                qbo_lib_model.SalesTermRef = {'value': qbo_rel_term.qbo_id}

        lines = []
        for line in self.qbo_invoice_line_ids:
            export_line = line._create_qbo_invoice_line()
            lines.append(export_line)

        qbo_lib_model.Line = lines

        return qbo_lib_model
