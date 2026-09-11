const AuditEvent = require('../models/AuditEvent');

async function recordAudit({ organizationId, actorId, action, entityType, entityId, before, after, reason, req, session }) {
  const [event] = await AuditEvent.create(
    [
      {
        organizationId,
        actorId: actorId || null,
        action,
        entityType,
        entityId,
        before: before || null,
        after: after || null,
        reason: reason || '',
        requestId: req?.requestId || null,
        ip: req?.ip || null,
        userAgent: req?.headers?.['user-agent'] || null,
      },
    ],
    { session }
  );
  return event;
}

module.exports = { recordAudit };
