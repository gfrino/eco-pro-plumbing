# -*- coding: utf-8 -*-
from odoo import SUPERUSER_ID, api

from odoo.addons.tw_companycam import _grant_companycam_to_internal_users


def migrate(cr, version):
    # Databases installed before 19.0.1.4.0: give CompanyCam to the internal users once
    env = api.Environment(cr, SUPERUSER_ID, {})
    _grant_companycam_to_internal_users(env)
