const router = require('express').Router();
const { z } = require('zod');
const policyController = require('../controllers/policyController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { policyUpdateSchema } = require('../validators/schemas');

router.use(requireAuth, requirePermission(PERMISSIONS.MASTER_MANAGE));

const policyUpsertSchema = policyUpdateSchema.extend({ siteId: z.string().nullish() });

router.get('/', policyController.getOne);
router.put('/', validate(policyUpsertSchema), policyController.upsert);

module.exports = router;
