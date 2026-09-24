import { Router } from 'express';
import { requireCrmUser, requireCrmRole } from '../core/auth/authMiddleware';
import {
  bootstrapAdmin,
  createUser,
  login,
  listUsers,
  updateUser,
  setUserStatus,
  resetUserPassword,
  changeOwnPassword,
  deleteUser
} from './controllers/authController';
import { getApiCredentials, updateApiCredentials } from './controllers/credentialController';
import {
  assignConversation,
  claimConversation,
  getConversation,
  getBusinessHours,
  getSlaPolicy,
  listConversationStatuses,
  createConversationStatus,
  updateConversationStatusConfig,
  deleteConversationStatusConfig,
  deleteBusinessHourException,
  listBusinessHourExceptions,
  listConversations,
  listNotifications,
  markNotificationRead,
  reactivateBot,
  saveBusinessHourException,
  sendAgentMessage,
  streamCrmEvents,
  updateBusinessHours,
  updateConversationStatus,
  updateSlaPolicy
} from './controllers/conversationController';
import { listLeads } from './controllers/leadController';

export const crmRouter = Router();

crmRouter.post('/auth/bootstrap', bootstrapAdmin);
crmRouter.post('/auth/login', login);
crmRouter.use(requireCrmUser);
crmRouter.post('/auth/users', requireCrmRole('ADMIN'), createUser);
crmRouter.get('/auth/users', requireCrmRole('ADMIN'), listUsers);
crmRouter.patch('/auth/users/:id', requireCrmRole('ADMIN'), updateUser);
crmRouter.patch('/auth/users/:id/status', requireCrmRole('ADMIN'), setUserStatus);
crmRouter.post('/auth/users/:id/reset-password', requireCrmRole('ADMIN'), resetUserPassword);
crmRouter.delete('/auth/users/:id', requireCrmRole('ADMIN'), deleteUser);
crmRouter.post('/auth/change-password', changeOwnPassword);
crmRouter.get('/settings/credentials', requireCrmRole('ADMIN'), getApiCredentials);
crmRouter.put('/settings/credentials', requireCrmRole('ADMIN'), updateApiCredentials);
crmRouter.get('/leads', listLeads);
crmRouter.get('/conversations', listConversations);
crmRouter.get('/conversations/:id', getConversation);
crmRouter.post('/conversations/:id/claim', claimConversation);
crmRouter.post('/conversations/:id/bot', reactivateBot);
crmRouter.post('/conversations/:id/assign', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), assignConversation);
crmRouter.patch('/conversations/:id/status', updateConversationStatus);
crmRouter.post('/conversations/:id/messages', sendAgentMessage);
crmRouter.get('/settings/sla', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), getSlaPolicy);
crmRouter.put('/settings/sla', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateSlaPolicy);
crmRouter.get('/settings/statuses', requireCrmUser, listConversationStatuses);
crmRouter.post('/settings/statuses', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), createConversationStatus);
crmRouter.patch('/settings/statuses/:id', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateConversationStatusConfig);
crmRouter.delete('/settings/statuses/:id', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), deleteConversationStatusConfig);
crmRouter.get('/settings/business-hours', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), getBusinessHours);
crmRouter.put('/settings/business-hours', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateBusinessHours);
crmRouter.get('/settings/business-hours/exceptions', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), listBusinessHourExceptions);
crmRouter.put('/settings/business-hours/exceptions', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), saveBusinessHourException);
crmRouter.delete('/settings/business-hours/exceptions/:date', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), deleteBusinessHourException);
crmRouter.get('/notifications', listNotifications);
crmRouter.patch('/notifications/:id/read', markNotificationRead);
crmRouter.get('/events', streamCrmEvents);
