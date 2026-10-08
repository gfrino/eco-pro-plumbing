from odoo import models

class ProductProduct(models.Model):
    _inherit = 'product.product'

    def _get_condition_for_check_qbo_duplicate(self, qbo_lib_model):
        """
        Override to properly escape single quotes in product names.
        This prevents QuickBooks API QueryParserError when syncing products
        that have quotes in their names (e.g. 1/2" copper pipe or 2'x2').
        """
        if qbo_lib_model.Name:
            name_escaped = qbo_lib_model.Name.replace("'", "\\'")
            return f"Name = '{name_escaped}'"
        return super()._get_condition_for_check_qbo_duplicate(qbo_lib_model)
