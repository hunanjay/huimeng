import { Router } from 'express';
import { getMemberQuota, getOrgQuota, setMemberQuota } from '../db.js';

const router = Router();

router.get('/org/quota', (req, res) => {
  if (req.role === 'org.admin' || req.role === 'superadmin') return res.json(getOrgQuota(req.org.id));
  const quota = getMemberQuota(req.org.id, req.user.id);
  return quota ? res.json(quota) : res.status(404).json({ error: '成员不存在' });
});

router.put('/org/members/:userId/quota', (req, res) => {
  if (req.role !== 'org.admin') return res.status(403).json({ error: '仅组织管理员可分配成员额度' });
  try {
    const quota = setMemberQuota({ orgId: req.org.id, userId: req.params.userId, amount: req.body?.amount, actorUserId: req.user.id });
    return res.json(quota);
  } catch (error) { return res.status(error.message === '成员不存在' ? 404 : 400).json({ error: error.message }); }
});

export default router;
