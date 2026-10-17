import json
import logging
from datetime import timedelta

from odoo import api, fields, models

_logger = logging.getLogger(__name__)

PARAM_EMAIL = 'eco_pro_custom.qbo_health.alert_email'
PARAM_STATE = 'eco_pro_custom.qbo_health.state'
DEFAULT_EMAIL = 'odoo@ticinoweb.net'
TOKEN_STALE_HOURS = 6        # refresh cron runs every 56 minutes
QUEUE_STUCK_HOURS = 2        # pending/enqueued jobs older than this = runner stuck
REALERT_HOURS = 24           # same issue is re-notified at most once a day


class QuickbooksIntegrationHealth(models.Model):
    """QuickBooks sync health monitor.

    Hourly cron: checks every active QuickBooks connection and emails the
    configured address when the sync is broken (expired/revoked tokens,
    token refresh no longer persisted, failed jobs, stuck queue).
    A single "recovered" email is sent when everything is back to normal.
    """
    _inherit = 'quickbooks.integration'

    # ------------------------------------------------------------------ checks

    def _eco_pro_qbo_collect_issues(self):
        self.ensure_one()
        now = fields.Datetime.now()
        issues = []

        # 1. Live API call: the only reliable proof that tokens are valid.
        try:
            self._fetch_qbo_company_info()
        except Exception as ex:  # noqa: BLE001 - any API/auth error is an issue
            msg = str(ex.args[0]) if ex.args else str(ex)
            kind = 'auth' if ('401' in msg or 'Auth' in msg) else 'api'
            issues.append({
                'key': 'connection_%s' % kind,
                'title': 'QuickBooks API not reachable (%s)' % ('authentication failed - reconnect needed' if kind == 'auth' else 'API error'),
                'detail': msg[:800],
            })

        # 2. Token refresh must keep rewriting the record; if it stops, the
        #    refresh token silently expires after 100 days (incident 11.10.2026).
        if self.write_date and self.write_date < now - timedelta(hours=TOKEN_STALE_HOURS):
            issues.append({
                'key': 'token_stale',
                'title': 'Access token not refreshed for %d hours' % int((now - self.write_date).total_seconds() // 3600),
                'detail': 'Last token write: %s UTC. Cron "QuickBooks Online: Refresh Access Token" may be disabled or failing.' % self.write_date,
            })

        # 3. Failed jobs (grouped by error message).
        Job = self.env['queue.job'].sudo()
        failed = Job.search([('state', '=', 'failed')])
        if failed:
            grouped = {}
            for job in failed:
                reason = (job.exc_info or '').strip().splitlines()
                reason = reason[-1][:200] if reason else 'unknown error'
                grouped.setdefault(reason, 0)
                grouped[reason] += 1
            lines = ['%d x %s' % (n, r) for r, n in sorted(grouped.items(), key=lambda i: -i[1])[:8]]
            issues.append({
                'key': 'jobs_failed',
                'title': '%d QuickBooks job(s) in state FAILED' % len(failed),
                'detail': '\n'.join(lines),
            })

        # 4. Stuck queue: jobs waiting for too long means the job runner is down.
        stuck = Job.search_count([
            ('state', 'in', ('pending', 'enqueued', 'started')),
            ('date_created', '<', now - timedelta(hours=QUEUE_STUCK_HOURS)),
        ])
        if stuck:
            issues.append({
                'key': 'queue_stuck',
                'title': '%d job(s) waiting for more than %d hours' % (stuck, QUEUE_STUCK_HOURS),
                'detail': 'The queue job runner is probably not running (check integration_queue_job / Odoo workers).',
            })

        return issues

    # ------------------------------------------------------------------ cron

    @api.model
    def eco_pro_qbo_health_check(self):
        """Entry point of the hourly cron."""
        ICP = self.env['ir.config_parameter'].sudo()
        to_email = (ICP.get_param(PARAM_EMAIL) or DEFAULT_EMAIL).strip()
        try:
            state = json.loads(ICP.get_param(PARAM_STATE) or '{}')
        except ValueError:
            state = {}
        now = fields.Datetime.now()

        for integration in self.search([('state', '=', 'active')]):
            issues = integration._eco_pro_qbo_collect_issues()
            key_prefix = 'qi%s_' % integration.id
            alerted = {k: v for k, v in state.items() if k.startswith(key_prefix)}

            if issues:
                to_send = []
                for issue in issues:
                    skey = key_prefix + issue['key']
                    last = alerted.get(skey)
                    if not last or fields.Datetime.from_string(last) < now - timedelta(hours=REALERT_HOURS):
                        to_send.append(issue)
                        state[skey] = fields.Datetime.to_string(now)
                # forget issues that disappeared
                for skey in list(alerted):
                    if skey[len(key_prefix):] not in [i['key'] for i in issues]:
                        state.pop(skey, None)
                if to_send:
                    integration._eco_pro_qbo_send_alert(to_email, to_send, recovered=False)
                    _logger.warning('QuickBooks health: %d issue(s) on %s, alert sent to %s',
                                    len(to_send), integration.display_name, to_email)
            elif alerted:
                for skey in alerted:
                    state.pop(skey, None)
                integration._eco_pro_qbo_send_alert(to_email, [], recovered=True)
                _logger.info('QuickBooks health: %s recovered, notice sent to %s', integration.display_name, to_email)

        ICP.set_param(PARAM_STATE, json.dumps(state))
        return True

    # ------------------------------------------------------------------ mail

    def _eco_pro_qbo_send_alert(self, to_email, issues, recovered=False):
        self.ensure_one()
        company = self.company_id or self.env.company
        base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url') or ''
        link = '%s/odoo/qi-connection/%s' % (base_url, self.id)
        if recovered:
            subject = '[%s] QuickBooks sync OK again - %s' % (company.name, self.display_name)
            body = (
                '<p>The QuickBooks synchronisation of <b>%s</b> (%s) is working again: '
                'API reachable, tokens refreshed, no failed jobs.</p>'
                % (company.name, self.display_name)
            )
        else:
            subject = '[%s] QuickBooks sync PROBLEM - %s' % (company.name, self.display_name)
            items = ''.join(
                '<li><b>%s</b><br/><pre style="white-space:pre-wrap;margin:4px 0 10px 0">%s</pre></li>'
                % (i['title'], (i['detail'] or '').replace('<', '&lt;').replace('>', '&gt;'))
                for i in issues
            )
            body = (
                '<p>The QuickBooks synchronisation of <b>%s</b> (%s) reports the following problem(s):</p>'
                '<ul>%s</ul>'
                '<p>Connection: <a href="%s">%s</a><br/>'
                'If authentication failed: QuickBooks Online &rarr; Connections &rarr; Integration &rarr; '
                'Re-authenticate Connection (Intuit login of the company admin).<br/>'
                'Failed jobs: QuickBooks Online &rarr; Jobs &rarr; filter Failed &rarr; Requeue after fixing the cause.</p>'
                '<p style="color:#888">Automatic check every hour; the same problem is reported at most once every %d hours.</p>'
                % (company.name, self.display_name, items, link, link, REALERT_HOURS)
            )
        email_from = company.email or self.env.user.email_formatted
        self.env['mail.mail'].sudo().create({
            'subject': subject,
            'body_html': body,
            'email_to': to_email,
            'email_from': email_from,
            'auto_delete': True,
        }).send(raise_exception=False)
