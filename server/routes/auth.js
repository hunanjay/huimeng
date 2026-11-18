import { Router } from 'express';
import { acceptOrgInvite, changeOrgMemberRole, createAccount, createOrgInvite, createOrganization, deleteSession, getSession, listOrgAudit, listOrgInvites, listOrgMembers, listOrganizations, loginAccount, platformOverview, removeOrgMember, resendOrgInvite, revokeOrgInvite, setOrganizationAdmin, setOrganizationStatus } from '../db.js';

const router = Router();
const bearer = req => (req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
  (req.headers.cookie || '').split('; ').find(value => value.startsWith('huimeng_session='))?.slice('huimeng_session='.length) || '';
const handle = fn => (req, res) => {
  try {
    const result = fn(req.body || {});
    if (result.token) res.cookie('huimeng_session', result.token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 86400000, path: '/api' });
    return res.json(result);
  } catch (error) {
    return res.status(error.message.includes('已注册') ? 409 : error.status || 400).json({ error: error.message });
  }
};
const setSessionCookie = (req, res, token) => res.cookie('huimeng_session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 86400000, path: '/api' });
const requireOrgAdmin = (req, res, next) => {
  if (!['org.admin', 'superadmin'].includes(req.role)) return res.status(403).json({ error: '需要组织管理员权限' });
  next();
};
const requireSuperadmin = (req, res, next) => {
  if (req.role !== 'superadmin') return res.status(403).json({ error: '需要平台管理员权限' });
  next();
};

router.post('/auth/register', handle(createAccount));
router.post('/auth/login', handle(loginAccount));
router.post('/auth/accept-invite', (req, res) => {
  try {
    const result = acceptOrgInvite(req.body || {});
    setSessionCookie(req, res, result.token);
    return res.status(201).json(result);
  } catch (error) { return res.status(400).json({ error: error.message }); }
});
router.get('/auth/session', (req, res) => {
  const session = getSession(bearer(req));
  if (!session) return res.status(401).json({ error: '登录已失效' });
  return res.json(session);
});
router.delete('/auth/session', (req, res) => {
  deleteSession(bearer(req));
  res.clearCookie('huimeng_session', { httpOnly: true, sameSite: 'strict', path: '/api' });
  res.status(204).end();
});

router.get('/platform/overview', requireSuperadmin, (req, res) => res.json(platformOverview()));
router.get('/platform/orgs', requireSuperadmin, (req, res) => res.json({ items: listOrganizations() }));
router.post('/platform/orgs', requireSuperadmin, (req, res) => {
  try {
    const result = createOrganization({ ...req.body, actorUserId: req.user.id });
    return res.status(201).json({ ...result, invitePath: `/invite?token=${encodeURIComponent(result.invite.token)}` });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});
router.patch('/platform/orgs/:id/status', requireSuperadmin, (req, res) => {
  try {
    const org = setOrganizationStatus({ orgId: req.params.id, actorUserId: req.user.id, status: req.body?.status });
    return org ? res.json(org) : res.status(404).json({ error: '组织不存在' });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});
router.patch('/platform/orgs/:id/admin', requireSuperadmin, (req, res) => {
  try { return res.json(setOrganizationAdmin({ orgId: req.params.id, actorUserId: req.user.id, email: req.body?.email })); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});

router.get('/org/members', requireOrgAdmin, (req, res) => res.json({ items: listOrgMembers(req.org.id) }));
router.get('/org/invites', requireOrgAdmin, (req, res) => res.json({ items: listOrgInvites(req.org.id) }));
router.post('/org/invites', requireOrgAdmin, (req, res) => {
  try {
    const invite = createOrgInvite({ orgId: req.org.id, actorUserId: req.user.id, email: req.body?.email, role: req.body?.role || 'org.user' });
    res.status(201).json({ ...invite, invitePath: `/invite?token=${encodeURIComponent(invite.token)}` });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
router.post('/org/invites/:id/resend', requireOrgAdmin, (req, res) => {
  const invite = resendOrgInvite({ orgId: req.org.id, actorUserId: req.user.id, inviteId: req.params.id });
  if (!invite) return res.status(404).json({ error: '邀请不存在' });
  return res.json({ ...invite, invitePath: `/invite?token=${encodeURIComponent(invite.token)}` });
});
router.delete('/org/invites/:id', requireOrgAdmin, (req, res) => {
  if (!revokeOrgInvite({ orgId: req.org.id, actorUserId: req.user.id, inviteId: req.params.id })) return res.status(404).json({ error: '邀请不存在' });
  return res.status(204).end();
});
router.patch('/org/members/:id', requireOrgAdmin, (req, res) => {
  try {
    if (!changeOrgMemberRole({ orgId: req.org.id, actorUserId: req.user.id, userId: req.params.id, role: req.body?.role })) return res.status(404).json({ error: '成员不存在' });
    return res.json({ ok: true });
  } catch (error) { return res.status(409).json({ error: error.message }); }
});
router.delete('/org/members/:id', requireOrgAdmin, (req, res) => {
  try {
    if (!removeOrgMember({ orgId: req.org.id, actorUserId: req.user.id, userId: req.params.id })) return res.status(404).json({ error: '成员不存在' });
    return res.status(204).end();
  } catch (error) { return res.status(409).json({ error: error.message }); }
});
router.get('/org/audit', requireOrgAdmin, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  return res.json({ items: listOrgAudit(req.org.id, limit) });
});

export default router;
