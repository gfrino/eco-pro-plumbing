import logging
from odoo import models, _
from odoo.exceptions import UserError
from odoo.addons.quickbooks_sync_online.quickbooks_api import catch_exception, QboClassManager

_logger = logging.getLogger(__name__)

class QuickbooksIntegration(models.Model):
    _inherit = 'quickbooks.integration'

    @catch_exception
    def action_import_historical_invoice_poc(self, client=None, _perform_sub_query=True):
        self.ensure_one()
        if not client:
            client = self.get_quickbooks_api_client()

        InvoiceCls = QboClassManager.get_class('invoice')
        # Fetch the most recent invoice
        invoices = InvoiceCls.query("SELECT * FROM Invoice MAXRESULTS 1", qb=client)
        if not invoices:
            raise UserError(_("No invoices found in QuickBooks."))

        qbo_invoice = invoices[0]
        _logger.info("Found QB Invoice ID: %s, DocNumber: %s", qbo_invoice.Id, qbo_invoice.DocNumber)

        # 1. Find Partner
        if not qbo_invoice.CustomerRef:
            raise UserError(_("Invoice %s has no CustomerRef.") % qbo_invoice.DocNumber)
        
        partner_mapping = self.env['qbo.map.partner'].search([
            ('qbo_id', '=', qbo_invoice.CustomerRef.value),
            ('quickbooks_integration_id', '=', self.id)
        ], limit=1)

        if not partner_mapping or not partner_mapping.partner_id:
            raise UserError(_("Partner mapping not found for QB Customer ID %s. Please run Master Data import first.") % qbo_invoice.CustomerRef.value)

        partner = partner_mapping.partner_id

        # 2. Prepare Invoice lines
        invoice_lines = []
        for line in qbo_invoice.Line:
            if line.DetailType == 'SalesItemLineDetail':
                item_ref = line.SalesItemLineDetail.ItemRef
                if not item_ref:
                    continue

                product_mapping = self.env['qbo.map.product'].search([
                    ('qbo_id', '=', item_ref.value),
                    ('quickbooks_integration_id', '=', self.id)
                ], limit=1)

                product = product_mapping.product_id

                line_vals = {
                    'name': line.Description or getattr(item_ref, 'name', 'QB Item'),
                    'quantity': line.SalesItemLineDetail.Qty or 1.0,
                    'price_unit': line.SalesItemLineDetail.UnitPrice or 0.0,
                }
                if product:
                    line_vals['product_id'] = product.id

                # NOTE: For PoC we are skipping tax mapping complexity and strict account mapping.
                invoice_lines.append((0, 0, line_vals))

        if not invoice_lines:
            raise UserError(_("No valid sales lines found in QB Invoice %s.") % qbo_invoice.DocNumber)

        # 3. Create Odoo Invoice
        move_vals = {
            'move_type': 'out_invoice',
            'partner_id': partner.id,
            'invoice_date': qbo_invoice.TxnDate,
            'ref': qbo_invoice.DocNumber,
            'invoice_line_ids': invoice_lines,
        }

        # Handle currency if multi-currency
        if getattr(qbo_invoice, 'CurrencyRef', False):
            currency = self.env['res.currency'].search([('name', '=', qbo_invoice.CurrencyRef.value)], limit=1)
            if currency:
                move_vals['currency_id'] = currency.id

        # Use mark_as_excluded_from_qbo_sync in context to prevent auto-export back to QB
        move = self.env['account.move'].with_company(self.company_id).with_context(mark_as_excluded_from_qbo_sync=True).create(move_vals)

        # 4. Create mapping record so we know it's synced
        self.env['qbo.map.account.move'].create({
            'qbo_id': qbo_invoice.Id,
            'qbo_name': {
                'doc_number': getattr(qbo_invoice, 'DocNumber', ''),
                'payment_ref_num': '',
            },
            'quickbooks_integration_id': self.id,
            'invoice_id': move.id,
            'qbo_lib_type': 'invoice',
        })

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Import Success"),
                'message': _("Imported Invoice %s (QB ID: %s). Check Draft Invoices.") % (qbo_invoice.DocNumber, qbo_invoice.Id),
                'type': 'success',
                'sticky': True,
            }
        }
