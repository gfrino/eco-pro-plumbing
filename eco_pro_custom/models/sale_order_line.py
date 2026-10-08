import re

from lxml import html as lxml_html
from markupsafe import Markup

from odoo import _, api, fields, models
from odoo.tools import is_html_empty, plaintext2html


def _note_plain_text(note_html):
    """Readable text of a formatted note (no markdown stars or link footnotes),
    one line per paragraph / list item."""
    if not note_html or is_html_empty(note_html):
        return ''
    text = re.sub(r'(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr)>', '\n', str(note_html))
    text = lxml_html.fromstring(f'<div>{text}</div>').text_content()
    return '\n'.join(line.strip() for line in text.splitlines() if line.strip())


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    note_html = fields.Html(
        string="Formatted Note", sanitize_style=True,
        help="Note with formatting (bold, colours, lists…) shown on the quotation PDF and the customer portal.")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            self._eco_sync_note_vals(vals)
        return super().create(vals_list)

    def write(self, vals):
        if 'note_html' in vals or 'name' in vals:
            for line in self:
                line_vals = dict(vals)
                line._eco_sync_note_vals(line_vals)
                super(SaleOrderLine, line).write(line_vals)
            return True
        return super().write(vals)

    def _eco_sync_note_vals(self, vals):
        """Keep the plain-text `name` (used by invoices, search, chatter) and the
        formatted note in step. Editing the plain text in the list replaces the formatting."""
        display_type = vals.get('display_type', self.display_type if self else False)
        if display_type != 'line_note':
            return
        if 'note_html' in vals:
            html = vals['note_html']
            if not is_html_empty(html):
                vals['name'] = _note_plain_text(html) or vals.get('name') or ' '
        elif 'name' in vals and self:
            current_plain = _note_plain_text(self.note_html)
            if (vals['name'] or '').strip() != current_plain:
                vals['note_html'] = False

    def _eco_note_display(self):
        """Formatted note when there is one, otherwise the plain text with its line breaks."""
        self.ensure_one()
        if self.note_html and not is_html_empty(self.note_html):
            return self.note_html
        return Markup(plaintext2html(self.name or ''))

    def action_eco_format_note(self):
        self.ensure_one()
        if not self.note_html and self.name:
            self.note_html = plaintext2html(self.name)
        return {
            'type': 'ir.actions.act_window',
            'name': _("Format Note"),
            'res_model': 'sale.order.line',
            'res_id': self.id,
            'view_mode': 'form',
            'views': [(self.env.ref('eco_pro_custom.view_sale_order_line_note_form').id, 'form')],
            'target': 'new',
        }
