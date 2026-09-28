import { Router } from 'express';
import express from 'express';
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
  getMedia,
  getSlaPolicy,
  listAssignableUsers,
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
  sendAgentAttachment,
  sendAgentMessage,
  startConversation,
  streamCrmEvents,
  updateBusinessHours,
  updateConversationStatus,
  updateSlaPolicy
} from './controllers/conversationController';
import { listLeads } from './controllers/leadController';
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply
} from './controllers/quickReplyController';

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
crmRouter.post('/conversations/start', startConversation);
crmRouter.get('/conversations/:id', getConversation);
crmRouter.get('/media/:id', getMedia);
crmRouter.post('/conversations/:id/claim', claimConversation);
crmRouter.post('/conversations/:id/bot', reactivateBot);
crmRouter.post('/conversations/:id/assign', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), assignConversation);
crmRouter.get('/assignable-users', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), listAssignableUsers);
crmRouter.patch('/conversations/:id/status', updateConversationStatus);
crmRouter.post('/conversations/:id/messages', sendAgentMessage);
crmRouter.post(
  '/conversations/:id/attachments',
  express.raw({ type: () => true, limit: '60mb' }),
  sendAgentAttachment
);
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
crmRouter.get('/quick-replies', listQuickReplies);
crmRouter.post('/quick-replies', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), createQuickReply);
crmRouter.patch('/quick-replies/:id', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateQuickReply);
crmRouter.delete('/quick-replies/:id', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), deleteQuickReply);
