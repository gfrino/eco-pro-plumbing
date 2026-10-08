# -*- coding: utf-8 -*-
from random import randint

from odoo import fields, models


class CompanycamTag(models.Model):
    _name = 'companycam.tag'
    _description = 'Photo Tag'
    _order = 'sequence, name'

    def _default_color(self):
        return randint(1, 11)

    name = fields.Char(required=True, translate=True)
    color = fields.Integer(default=_default_color)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    photo_count = fields.Integer(compute='_compute_photo_count')

    _name_uniq = models.Constraint('unique (name)', 'A tag with this name already exists.')

    def _compute_photo_count(self):
        counts = dict(self.env['companycam.photo']._read_group(
            [('tag_ids', 'in', self.ids)], ['tag_ids'], ['__count']))
        for tag in self:
            tag.photo_count = counts.get(tag, 0)
