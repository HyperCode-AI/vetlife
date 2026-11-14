import { Router } from 'express';
import { repositorySingleton } from '../../infrastructure/repositories/HybridVetLifeRepository';
import { VetLifeController } from '../controllers/VetLifeController';
import {
  authenticate,
  requireRole,
} from '../middlewares/authMiddleware';

export function createApiV1Router(): Router {
  const router = Router();
  const controller = new VetLifeController(repositorySingleton);

  // Healthcheck
  router.get('/health', controller.health);

  // ===========================================================================
  // 1. Authentication (Admin, Biomedical & Veterinarian)
  // ===========================================================================
  router.post('/auth/login', controller.loginInternal);
  router.post('/auth/vet-login', controller.loginVet);
  router.get('/auth/me', authenticate, controller.getMe);

  // ===========================================================================
  // 2. Public Portal (Tutor Protocol Lookup RN-02 & Collection Request)
  // ===========================================================================
  router.get('/public/protocol/:protocolCode', controller.getPublicProtocolReport);
  router.get('/public/pdfs', controller.downloadPublicPdf);
  router.post('/public/collection-requests', controller.createCollectionRequest);
  router.get(
    '/collection-requests',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listCollectionRequests
  );
  router.patch(
    '/collection-requests/:id/status',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.updateCollectionRequestStatus
  );

  // ===========================================================================
  // 3. Veterinarian Portal (HU-10, HU-11) — Strictly Veterinarians Only
  // ===========================================================================
  router.get(
    '/vet/orders',
    authenticate,
    requireRole('vet'),
    controller.listVetPortalOrders
  );

  // ===========================================================================
  // 4. Settings & Catalog (Admin Only Write — RN-01, HU-01 to HU-05)
  // ===========================================================================
  // Exams
  router.get(
    '/exams',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listExams
  );
  router.get(
    '/exams/:id',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.getExamById
  );
  router.post('/exams', authenticate, requireRole('admin'), controller.createExam);
  router.put('/exams/:id', authenticate, requireRole('admin'), controller.updateExam);
  router.delete('/exams/:id', authenticate, requireRole('admin'), controller.deleteExam);

  // Dynamic Input Fields per Exam (HU-02, RN-03)
  router.get(
    '/exams/:id/fields',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listExamFields
  );
  router.post(
    '/exams/:id/fields',
    authenticate,
    requireRole('admin'),
    controller.addExamField
  );
  router.put(
    '/exams/:id/fields',
    authenticate,
    requireRole('admin'),
    controller.updateExamFields
  );
  router.delete(
    '/exams/:id/fields/:fieldId',
    authenticate,
    requireRole('admin'),
    controller.deleteExamField
  );

  // Price Tables with Effective Dates (HU-03, RN-04)
  router.get(
    '/price-tables',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listPriceTables
  );
  router.get(
    '/price-tables/active',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.getActivePriceTable
  );
  router.post(
    '/price-tables',
    authenticate,
    requireRole('admin'),
    controller.createPriceTable
  );
  router.put(
    '/price-tables/:id',
    authenticate,
    requireRole('admin'),
    controller.updatePriceTable
  );
  router.delete(
    '/price-tables/:id',
    authenticate,
    requireRole('admin'),
    controller.deletePriceTable
  );

  // Exam Reference Values by Species / Gender / Age (HU-04)
  router.get(
    '/exam-references',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listExamReferences
  );
  router.post(
    '/exam-references',
    authenticate,
    requireRole('admin'),
    controller.createExamReference
  );
  router.put(
    '/exam-references/:id',
    authenticate,
    requireRole('admin'),
    controller.updateExamReference
  );
  router.delete(
    '/exam-references/:id',
    authenticate,
    requireRole('admin'),
    controller.deleteExamReference
  );

  // Report Templates with Dynamic Tags (HU-05)
  router.get(
    '/report-templates',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listReportTemplates
  );
  router.post(
    '/report-templates',
    authenticate,
    requireRole('admin'),
    controller.createReportTemplate
  );
  router.put(
    '/report-templates/:id',
    authenticate,
    requireRole('admin'),
    controller.updateReportTemplate
  );

  // ===========================================================================
  // 5. Laboratory Routine: Patients, Vets, Orders, Labels & Results (HU-06 to HU-09)
  // ===========================================================================
  router.get(
    '/patients',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listPatients
  );
  router.post(
    '/patients',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.createPatient
  );
  router.put(
    '/patients/:id',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.updatePatient
  );
  router.delete(
    '/patients/:id',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.deletePatient
  );

  router.get(
    '/vets',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listVets
  );
  router.post(
    '/vets',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.createVet
  );
  router.put(
    '/vets/:id',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.updateVet
  );
  router.delete(
    '/vets/:id',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.deleteVet
  );

  // Lab Users Management (Admin Only — Access exclusively to Laboratory Panel)
  router.get(
    '/users',
    authenticate,
    requireRole('admin'),
    controller.listUsers
  );
  router.post(
    '/users',
    authenticate,
    requireRole('admin'),
    controller.createUser
  );
  router.put(
    '/users/:id',
    authenticate,
    requireRole('admin'),
    controller.updateUser
  );
  router.delete(
    '/users/:id',
    authenticate,
    requireRole('admin'),
    controller.deleteUser
  );

  router.get(
    '/orders',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.listOrders
  );
  router.get(
    '/orders/:id',
    authenticate,
    requireRole('admin', 'biomedical', 'vet'),
    controller.getOrderById
  );
  router.post(
    '/orders',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.createOrder
  );
  router.get(
    '/orders/:id/labels',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.getOrderLabels
  );

  router.put(
    '/orders/:orderId/results/:resultId',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.saveExamResult
  );
  router.post(
    '/orders/:orderId/release',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.releaseOrderReport
  );
  router.post(
    '/orders/:orderId/publish-pdf',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.publishOrderPdf
  );

  // ===========================================================================
  // 6. Dashboards (Operational for Admin/Biomedical, Financial Exclusive to Admin RN-01)
  // ===========================================================================
  router.get(
    '/dashboard/operational',
    authenticate,
    requireRole('admin', 'biomedical'),
    controller.getOperationalDashboard
  );
  router.get(
    '/dashboard/financial',
    authenticate,
    requireRole('admin'),
    controller.getFinancialDashboard
  );

  return router;
}
