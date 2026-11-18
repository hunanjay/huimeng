import { Router } from 'express';
import { grantOrgQuota, platformOverview } from '../db.js';

const router = Router();

router.get('/platform/overview', (req, res) => {
  if (req.role !== 'superadmin') return res.status(403).json({ error: '仅平台管理员可访问' });
  return res.json(platformOverview());
});

router.post('/platform/orgs/:orgId/quota', (req, res) => {
  if (req.role !== 'superadmin') return res.status(403).json({ error: '仅平台管理员可分配组织额度' });
  try {
    const quota = grantOrgQuota({ orgId: req.params.orgId, amount: req.body?.amount, actorUserId: req.user.id });
    if (!quota) return res.status(404).json({ error: '组织不存在' });
    return res.status(201).json(quota);
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

export default router;
