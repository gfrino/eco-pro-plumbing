# -*- coding: utf-8 -*-
from odoo import Command

from . import models
from . import controllers


def _grant_companycam_to_internal_users(env):
    """Give CompanyCam to every active internal user, and to new users by default.

    Explicit assignment (not implied by "Internal User"), so it can still be removed from a
    single user. Runs once (install, or update to 19.0.1.4.0): a later removal is respected.
    """
    group = env.ref('tw_companycam.group_companycam_user')
    users = env['res.users'].search([('share', '=', False)])
    group.write({'user_ids': [Command.link(user.id) for user in users]})
    # Default access rights for new users (Settings > Users > Default Access Rights)
    env.ref('base.default_user_group').write({'implied_ids': [Command.link(group.id)]})


def post_init_hook(env):
    _grant_companycam_to_internal_users(env)
