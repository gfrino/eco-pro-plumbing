"""One-time fill: give existing customers the marketing origin of their oldest lead.
Only empty fields are filled, nothing is overwritten."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    total = 0
    for fname in ('campaign_id', 'medium_id', 'source_id', 'referred'):
        cr.execute(f"""
            UPDATE res_partner p
               SET {fname} = l.{fname}
              FROM (
                    SELECT DISTINCT ON (partner_id) partner_id, {fname}
                      FROM crm_lead
                     WHERE partner_id IS NOT NULL AND {fname} IS NOT NULL
                  ORDER BY partner_id, create_date, id
                   ) l
             WHERE p.id = l.partner_id AND p.{fname} IS NULL
        """)
        _logger.info("eco_pro_custom: filled %s on %s contacts from their oldest lead", fname, cr.rowcount)
        total += cr.rowcount
    _logger.info("eco_pro_custom: marketing backfill done (%s values)", total)
