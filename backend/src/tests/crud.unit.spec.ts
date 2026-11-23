import assert from 'assert';
import { EventEmitter } from 'events';
import { app } from '../app';
import { ExamUseCases } from '../application/use-cases/ExamUseCases';
import { OrderAndRoutineUseCases } from '../application/use-cases/OrderAndRoutineUseCases';
import { PriceTableUseCases } from '../application/use-cases/PriceTableUseCases';
import { PublicAndPortalUseCases } from '../application/use-cases/PublicAndPortalUseCases';
import { ReferenceAndTemplateUseCases } from '../application/use-cases/ReferenceAndTemplateUseCases';
import { HybridVetLifeRepository } from '../infrastructure/repositories/HybridVetLifeRepository';
import { buildThermalLabelsPdfBuffer } from '../utils/pdfStorage';

/**
 * In-process Express HTTP dispatcher (supports JSON & binary Buffer responses).
 */
async function invokeApp(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any; rawBuffer?: Buffer; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      host: 'vetlifelab.com.br',
    };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const req = Object.assign(new EventEmitter(), {
      method: method.toUpperCase(),
      url: `/api/v1${path}`,
      originalUrl: `/api/v1${path}`,
      headers,
      body: body !== undefined ? body : {},
      _body: true,
      connection: {},
      socket: {},
      ip: '127.0.0.1',
      get(headerName: string) {
        return headers[headerName.toLowerCase()];
      },
      header(headerName: string) {
        return headers[headerName.toLowerCase()];
      },
    });

    let statusCode = 200;
    const resHeaders: Record<string, string> = {};
    const chunks: Buffer[] = [];

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: false,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader(name: string, val: string) {
        resHeaders[name.toLowerCase()] = String(val);
        return this;
      },
      getHeader(name: string) {
        return resHeaders[name.toLowerCase()];
      },
      removeHeader(name: string) {
        delete resHeaders[name.toLowerCase()];
      },
      set(name: string, val: string) {
        resHeaders[name.toLowerCase()] = String(val);
        return this;
      },
      writeHead(code: number, hdrs?: Record<string, string>) {
        statusCode = code;
        this.statusCode = code;
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) {
            resHeaders[k.toLowerCase()] = String(v);
          }
        }
        return this;
      },
      write(chunk: string | Buffer) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      json(payload: unknown) {
        this.headersSent = true;
        resolve({ status: statusCode, json: payload, headers: resHeaders });
        return this;
      },
      send(payload: unknown) {
        this.headersSent = true;
        if (Buffer.isBuffer(payload)) {
          resolve({ status: statusCode, json: null, rawBuffer: payload, headers: resHeaders });
        } else if (typeof payload === 'string') {
          try {
            resolve({ status: statusCode, json: JSON.parse(payload), headers: resHeaders });
          } catch {
            resolve({ status: statusCode, json: payload, headers: resHeaders });
          }
        } else {
          resolve({ status: statusCode, json: payload, headers: resHeaders });
        }
        return this;
      },
      end(chunk?: string | Buffer) {
        this.headersSent = true;
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        const buf = Buffer.concat(chunks);
        const raw = buf.toString('utf8');
        try {
          resolve({ status: statusCode, json: raw ? JSON.parse(raw) : {}, rawBuffer: buf, headers: resHeaders });
        } catch {
          resolve({ status: statusCode, json: raw, rawBuffer: buf, headers: resHeaders });
        }
        return this;
      },
    });

    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function runCrudUnitTests(): Promise<void> {
  console.log('🧪 Iniciando suíte de testes unitários de todos os CRUDs, Agendamento e Etiquetas Zebra 50x30mm...\n');

  // Force isolated in-memory repo for pure unit tests
  const repo = new HybridVetLifeRepository();
  const examUC = new ExamUseCases(repo);
  const priceUC = new PriceTableUseCases(repo, repo);
  const refTplUC = new ReferenceAndTemplateUseCases(repo, repo);
  const orderUC = new OrderAndRoutineUseCases(repo);
  const publicUC = new PublicAndPortalUseCases(repo);

  // =========================================================================
  // 1. UNIT TEST: USERS CRUD
  // =========================================================================
  {
    const created = await repo.createUser({
      name: 'Dra. Unit Test',
      email: 'unit.user@vetlifelab.com.br',
      role: 'biomedical',
      password_hash: 'Unit@1234',
    });
    assert.ok(created.id);
    assert.strictEqual(created.email, 'unit.user@vetlifelab.com.br');

    const fetched = await repo.findUserById(created.id);
    assert.strictEqual(fetched?.name, 'Dra. Unit Test');

    const updated = await repo.updateUser(created.id, { name: 'Dra. Unit Updated', role: 'admin' });
    assert.strictEqual(updated.name, 'Dra. Unit Updated');
    assert.strictEqual(updated.role, 'admin');

    await assert.rejects(
      () =>
        repo.createUser({
          name: 'Dup',
          email: 'unit.user@vetlifelab.com.br',
          role: 'biomedical',
          password_hash: 'x',
        }),
      /Já existe um usuário/
    );

    await repo.deleteUser(created.id);
    assert.strictEqual(await repo.findUserById(created.id), null);
    await assert.rejects(() => repo.deleteUser(created.id), /não encontrado/);
    console.log('✅ [1/11] Unit CRUD: Users (Create, Read, Update, Conflict, Delete, NotFound)');
  }

  // =========================================================================
  // 2. UNIT TEST: EXAMS & EXAM INPUT FIELDS CRUD
  // =========================================================================
  {
    const exam = await examUC.createExam({
      code: 'UNIT-001',
      name: 'Exame Unitário de Perfil Hepático',
      section: 'Bioquímica',
      delivery_days: 2,
      tube_type: 'Tubo Amarelo com Gel Separador',
      label_qty: 2,
      price: 110,
    });
    assert.strictEqual(exam.code, 'UNIT-001');
    assert.strictEqual(exam.price, 110);

    const found = await examUC.getExamById(exam.id);
    assert.strictEqual(found.name, 'Exame Unitário de Perfil Hepático');

    const updated = await examUC.updateExam(exam.id, { name: 'Perfil Hepático Avançado', price: 125 });
    assert.strictEqual(updated.name, 'Perfil Hepático Avançado');
    assert.strictEqual(updated.price, 125);

    // Input fields CRUD
    const f1 = await examUC.addExamField(exam.id, {
      field_name: 'alt_tgp',
      field_label: 'ALT (TGP)',
      field_type: 'number',
      unit: 'U/L',
      options: [],
      is_required: true,
      display_order: 1,
    });
    assert.strictEqual(f1.field_name, 'alt_tgp');
    const fieldsAfterAdd = await examUC.listExamFields(exam.id);
    assert.ok(fieldsAfterAdd.some((f) => f.id === f1.id));

    const replaced = await examUC.replaceExamFields(exam.id, [
      {
        field_name: 'ast_tgo',
        field_label: 'AST (TGO)',
        field_type: 'number',
        unit: 'U/L',
        options: [],
        is_required: true,
        display_order: 1,
      },
    ]);
    assert.strictEqual(replaced.length, 1);
    assert.strictEqual(replaced[0].field_name, 'ast_tgo');

    await examUC.deleteExamField(exam.id, replaced[0].id);

    await examUC.deleteExam(exam.id);
    await assert.rejects(() => examUC.getExamById(exam.id), /não encontrado/);
    console.log('✅ [2/11] Unit CRUD: Exams & ExamInputFields');
  }

  // =========================================================================
  // 3. UNIT TEST: PRICE TABLES CRUD
  // =========================================================================
  {
    const pt = await priceUC.createPriceTable({
      name: 'Tabela Unitária 2026',
      partner_clinic: 'Clínica Unit',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      adjustment_percent: 10,
    });
    assert.ok(pt.id);
    assert.ok((pt.prices || []).length > 0);

    const updated = await priceUC.updatePriceTable(pt.id, {
      name: 'Tabela Unitária Atualizada',
      adjustment_percent: 5,
    });
    assert.strictEqual(updated.name, 'Tabela Unitária Atualizada');

    await priceUC.deletePriceTable(pt.id);
    await assert.rejects(() => priceUC.updatePriceTable(pt.id, { name: 'X' }), /não encontrada/);
    console.log('✅ [3/11] Unit CRUD: PriceTables (+ reajuste percentual)');
  }

  // =========================================================================
  // 4. UNIT TEST: EXAM REFERENCES CRUD
  // =========================================================================
  {
    const exams = await examUC.listExams();
    const targetExam = exams[0];
    const ref = await refTplUC.createReference({
      exam_id: targetExam.id,
      species: 'Felino',
      gender: 'Ambos',
      min_age_days: 90,
      max_age_days: 7300,
      reference_text_content: 'Valor normal felino: 10 a 50 U/L',
    });
    assert.ok(ref.id);

    const updated = await refTplUC.updateReference(ref.id, {
      reference_text_content: 'Valor normal felino atualizado: 12 a 55 U/L',
    });
    assert.ok(updated.reference_text_content.includes('12 a 55'));

    const filtered = await refTplUC.listReferences({ exam_id: targetExam.id, species: 'Felino' });
    assert.ok(filtered.some((r) => r.id === ref.id));

    await refTplUC.deleteReference(ref.id);
    await assert.rejects(() => refTplUC.deleteReference(ref.id), /não encontrada/);
    console.log('✅ [4/11] Unit CRUD: ExamReferences');
  }

  // =========================================================================
  // 5. UNIT TEST: REPORT TEMPLATES CRUD
  // =========================================================================
  {
    const tpl = await refTplUC.createReportTemplate({
      name: 'Modelo Unitário',
      header_html: '<h1>VetLife</h1>',
      body_template: '<p>{{resultados}}</p>',
      footer_html: '<small>Assinado</small>',
      is_default: false,
    });
    assert.ok(tpl.id);

    const updated = await refTplUC.updateReportTemplate(tpl.id, { name: 'Modelo Unitário v2' });
    assert.strictEqual(updated.name, 'Modelo Unitário v2');

    await refTplUC.deleteReportTemplate(tpl.id);
    await assert.rejects(() => refTplUC.deleteReportTemplate(tpl.id), /não encontrado/);
    console.log('✅ [5/11] Unit CRUD: ReportTemplates');
  }

  // =========================================================================
  // 6. UNIT TEST: PATIENTS CRUD
  // =========================================================================
  {
    const pat = await orderUC.createPatient({
      name: 'Gabrielle',
      species: 'Canino',
      breed: 'Shih-Tzu',
      gender: 'F',
      age_months: 24,
      tutor_name: 'Ana Karolina',
      tutor_phone: '(16) 99999-1234',
      tutor_email: 'ana@teste.com',
    });
    assert.ok(pat.id);
    assert.strictEqual(pat.name, 'Gabrielle');

    const updated = await orderUC.updatePatient(pat.id, { breed: 'Maltês' });
    assert.strictEqual(updated.breed, 'Maltês');

    await orderUC.deletePatient(pat.id);
    await assert.rejects(() => orderUC.deletePatient(pat.id), /não encontrado/);
    console.log('✅ [6/11] Unit CRUD: Patients');
  }

  // =========================================================================
  // 7. UNIT TEST: VETS CRUD (com CRMV obrigatório + senha de acesso)
  // =========================================================================
  {
    await assert.rejects(
      () =>
        orderUC.createVet({
          name: 'Tutor Sem CRMV',
          crmv: '',
          clinic_name: 'Sem Clínica',
          email: 'tutor@semcrmv.com.br',
          phone: '(16) 98888-0000',
        }),
      /CRMV é obrigatório/
    );

    const vetWithCrmv = await orderUC.createVet({
      name: 'Dr. Bruno Veterinário',
      crmv: 'CRMV-SP 77441',
      clinic_name: 'Clínica Bicho Feliz',
      email: 'bruno@bichofeliz.com.br',
      phone: '(16) 98888-0001',
      password_hash: 'VetPass@2026',
    });
    assert.ok(vetWithCrmv.id);
    assert.strictEqual(vetWithCrmv.crmv, 'CRMV-SP 77441');
    assert.strictEqual(vetWithCrmv.password_hash, 'VetPass@2026');

    const updated = await orderUC.updateVet(vetWithCrmv.id, { crmv: 'CRMV-SP 99887' });
    assert.strictEqual(updated.crmv, 'CRMV-SP 99887');

    await orderUC.deleteVet(vetWithCrmv.id);
    await assert.rejects(() => orderUC.deleteVet(vetWithCrmv.id), /não encontrado/);
    console.log('✅ [7/11] Unit CRUD: Vets (com CRMV obrigatório e senha)');
  }

  // =========================================================================
  // 8. UNIT TEST: ORDERS CRUD (Create, Read, Update, Labels, Delete)
  // =========================================================================
  {
    const vets = await orderUC.listVets();
    const exams = await examUC.listExams();
    const e1 = exams[0];
    const e2 = exams[1];

    const created = await orderUC.createOrder({
      patient: {
        name: 'Gabrielle',
        species: 'Canino',
        breed: 'Poodle',
        gender: 'F',
        tutor_name: 'Ana Karolina',
        tutor_phone: '(16) 99999-1111',
      },
      vet_id: vets[0].id,
      exam_ids: [e1.id],
      notes: 'Pedido inicial',
    });
    assert.ok(created.id);
    assert.strictEqual(created.results?.length, 1);

    const updated = await orderUC.updateOrder(created.id, {
      exam_ids: [e1.id, e2.id],
      notes: 'Pedido editado com 2 exames',
    });
    assert.strictEqual(updated.results?.length, 2);
    assert.strictEqual(updated.notes, 'Pedido editado com 2 exames');

    const labels = await orderUC.generateOrderLabels(created.id);
    assert.ok(labels.total_labels >= 2);

    await orderUC.deleteOrder(created.id);
    await assert.rejects(() => orderUC.getOrderById(created.id), /não encontrado/);
    console.log('✅ [8/11] Unit CRUD: Orders (Create, Read, Update, Labels, Delete)');
  }

  // =========================================================================
  // 9. UNIT TEST: COLLECTION REQUESTS / AGENDAMENTO CRUD (CRMV obrigatório)
  // =========================================================================
  {
    const reqCol = await publicUC.createCollectionRequest({
      clinic_or_tutor_name: 'Clínica São Francisco',
      crmv: 'CRMV-MG 18920',
      phone: '(16) 99123-4567',
      email: 'coleta@saofrancisco.vet.br',
      address: 'Rua Rui Barbosa, 450 - Centro',
      preferred_date: '2026-11-20',
      notes: '3 tubos EDTA + 2 tubos soro',
    });
    assert.ok(reqCol.id);
    assert.strictEqual(reqCol.status, 'pendente');
    assert.strictEqual(reqCol.crmv, 'CRMV-MG 18920');

    const fetched = await publicUC.getCollectionRequestById(reqCol.id);
    assert.strictEqual(fetched.clinic_or_tutor_name, 'Clínica São Francisco');

    // Agendar coleta
    const scheduled = await publicUC.updateCollectionRequestStatus(
      reqCol.id,
      'agendada',
      '2026-11-21',
      '09:30'
    );
    assert.strictEqual(scheduled.status, 'agendada');
    assert.strictEqual(scheduled.scheduled_date, '2026-11-21');
    assert.strictEqual(scheduled.scheduled_time, '09:30');

    // Status inválido deve lançar erro de validação
    await assert.rejects(
      () => publicUC.updateCollectionRequestStatus(reqCol.id, 'invalido'),
      /Status de coleta inválido/
    );

    // Atualização completa
    const edited = await publicUC.updateCollectionRequest(reqCol.id, {
      scheduled_time: '10:15',
      notes: 'Reagendado para 10:15',
    });
    assert.strictEqual(edited.scheduled_time, '10:15');
    assert.strictEqual(edited.notes, 'Reagendado para 10:15');

    // Filtro por status e busca
    const onlyScheduled = await publicUC.listCollectionRequests({
      status: 'agendada',
      search: 'São Francisco',
    });
    assert.ok(onlyScheduled.some((c) => c.id === reqCol.id));

    await publicUC.deleteCollectionRequest(reqCol.id);
    await assert.rejects(() => publicUC.getCollectionRequestById(reqCol.id), /não encontrada/);
    console.log('✅ [9/11] Unit CRUD: CollectionRequests / Agendamento completo');
  }

  // =========================================================================
  // 10. HTTP TESTS: AGENDAMENTO ENDPOINTS & ORDERS PUT/DELETE & VETS OPTIONAL CRMV
  // =========================================================================
  {
    const adminLogin = await invokeApp('POST', '/auth/login', {
      email: 'admin@vetlifelab.com.br',
      password: 'VetLifeL@b2026',
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken: string = adminLogin.json.token;

    // 10a. Criar solicitação pública de coleta (com CRMV obrigatório)
    const colCreate = await invokeApp('POST', '/public/collection-requests', {
      clinic_or_tutor_name: 'Hospital Vet Vida HTTP',
      crmv: 'CRMV-SP 60123',
      phone: '(16) 99222-3344',
      email: 'contato@vetvidahttp.com.br',
      address: 'Av. Independência, 1200',
      notes: 'Coleta urgente',
    });
    assert.strictEqual(colCreate.status, 201);
    const colId = colCreate.json.data.id;

    // 10b. GET /collection-requests/:id
    const colGet = await invokeApp('GET', `/collection-requests/${colId}`, undefined, adminToken);
    assert.strictEqual(colGet.status, 200);
    assert.strictEqual(colGet.json.data.id, colId);

    // 10c. PATCH /collection-requests/:id/status (agendar com data e hora)
    const colPatch = await invokeApp(
      'PATCH',
      `/collection-requests/${colId}/status`,
      { status: 'agendada', scheduled_date: '2026-11-25', scheduled_time: '14:00' },
      adminToken
    );
    assert.strictEqual(colPatch.status, 200);
    assert.strictEqual(colPatch.json.data.status, 'agendada');
    assert.strictEqual(colPatch.json.data.scheduled_date, '2026-11-25');
    assert.strictEqual(colPatch.json.data.scheduled_time, '14:00');

    // 10c-2. PATCH /collection-requests/col-002/status (suporte a ID legado 'col-002')
    const colLegacyPatch = await invokeApp(
      'PATCH',
      '/collection-requests/col-002/status',
      { status: 'agendada', scheduled_date: '2026-11-24', scheduled_time: '10:30' },
      adminToken
    );
    assert.strictEqual(colLegacyPatch.status, 200);
    assert.strictEqual(colLegacyPatch.json.data.status, 'agendada');
    assert.strictEqual(colLegacyPatch.json.data.scheduled_date, '2026-11-24');
    assert.strictEqual(colLegacyPatch.json.data.scheduled_time, '10:30');

    // 10d. PUT /collection-requests/:id/status (camelCase alias)
    const colPutStatus = await invokeApp(
      'PUT',
      `/collection-requests/${colId}/status`,
      { status: 'agendada', scheduledDate: '2026-11-26', scheduledTime: '16:30' },
      adminToken
    );
    assert.strictEqual(colPutStatus.status, 200);
    assert.strictEqual(colPutStatus.json.data.scheduled_date, '2026-11-26');
    assert.strictEqual(colPutStatus.json.data.scheduled_time, '16:30');

    // 10e. Status inválido -> 400
    const colBadStatus = await invokeApp(
      'PATCH',
      `/collection-requests/${colId}/status`,
      { status: 'status_errado' },
      adminToken
    );
    assert.strictEqual(colBadStatus.status, 400);

    // 10f. PUT /collection-requests/:id (edição completa)
    const colPut = await invokeApp(
      'PUT',
      `/collection-requests/${colId}`,
      { notes: 'Atualizado via PUT', status: 'concluida' },
      adminToken
    );
    assert.strictEqual(colPut.status, 200);
    assert.strictEqual(colPut.json.data.status, 'concluida');

    // 10g. DELETE /collection-requests/:id
    const colDel = await invokeApp('DELETE', `/collection-requests/${colId}`, undefined, adminToken);
    assert.strictEqual(colDel.status, 200);

    // 10h. Vet sem CRMV deve ser rejeitado (400) + Vet com CRMV e login com senha
    const vetNoCrmvCreate = await invokeApp(
      'POST',
      '/vets',
      {
        name: 'Tutor Sem CRMV HTTP',
        email: 'semcrmv.http@vet.com.br',
        phone: '(16) 99000-1122',
        password: 'SenhaSegura@2026',
        clinic_name: 'Clínica HTTP',
      },
      adminToken
    );
    assert.strictEqual(vetNoCrmvCreate.status, 400);

    const vetCreate = await invokeApp(
      'POST',
      '/vets',
      {
        name: 'Dra. Com CRMV HTTP',
        crmv: 'CRMV-SP 88776',
        email: 'comcrmv.http@vet.com.br',
        phone: '(16) 99000-1122',
        password: 'SenhaSegura@2026',
        clinic_name: 'Clínica HTTP',
      },
      adminToken
    );
    assert.strictEqual(vetCreate.status, 201);
    const vetLogin = await invokeApp('POST', '/auth/vet-login', {
      email: 'comcrmv.http@vet.com.br',
      password: 'SenhaSegura@2026',
    });
    assert.strictEqual(vetLogin.status, 200);
    assert.ok(vetLogin.json.token);

    // 10i. PUT /orders/:id e DELETE /orders/:id
    const examsRes = await invokeApp('GET', '/exams', undefined, adminToken);
    const ordCreate = await invokeApp(
      'POST',
      '/orders',
      {
        patient: {
          name: 'Gabrielle',
          species: 'Canino',
          breed: 'SRD',
          gender: 'F',
          tutor_name: 'Ana Karolina',
          tutor_phone: '(16) 99999-0000',
        },
        vet_id: vetCreate.json.data.id,
        exam_ids: [examsRes.json.data[0].id],
      },
      adminToken
    );
    assert.strictEqual(ordCreate.status, 201);
    const ordId = ordCreate.json.data.id;

    const ordUpdate = await invokeApp(
      'PUT',
      `/orders/${ordId}`,
      {
        exam_ids: [examsRes.json.data[0].id, examsRes.json.data[1].id],
        notes: 'Atualizado via PUT /orders/:id',
      },
      adminToken
    );
    assert.strictEqual(ordUpdate.status, 200);
    assert.strictEqual(ordUpdate.json.data.results.length, 2);

    // 10j. GET /orders/:id/labels/pdf (Zebra 50mm x 30mm, P&B, sem código de barras)
    const pdfRes = await invokeApp('GET', `/orders/${ordId}/labels/pdf`, undefined, adminToken);
    assert.strictEqual(pdfRes.status, 200);
    assert.strictEqual(pdfRes.headers['content-type'], 'application/pdf');
    assert.ok(pdfRes.rawBuffer && pdfRes.rawBuffer.length > 300);
    const pdfText = pdfRes.rawBuffer!.toString('latin1');
    assert.ok(pdfText.startsWith('%PDF-1.4'), 'PDF deve iniciar com %PDF-1.4');
    assert.ok(pdfText.includes('/MediaBox [0 0 141.73 85.04]'), 'Página deve ter exatos 50mm x 30mm (141.73 x 85.04 pt)');
    assert.ok(pdfText.includes('GABRIELLE'), 'Nome do paciente deve estar no PDF');
    assert.ok(pdfText.includes('Tutor: Ana Karolina'), 'Nome do tutor deve estar no PDF');
    assert.ok(!/\d\.\d+\s+\d\.\d+\s+\d\.\d+\s+rg/.test(pdfText), 'PDF térmico deve ser estritamente P&B (sem cores RGB)');

    const ordDel = await invokeApp('DELETE', `/orders/${ordId}`, undefined, adminToken);
    assert.strictEqual(ordDel.status, 200);
    await invokeApp('DELETE', `/vets/${vetCreate.json.data.id}`, undefined, adminToken);

    console.log('✅ [10/11] HTTP Endpoints: Agendamento CRUD, Vets sem CRMV, Orders PUT/DELETE e Labels PDF 50x30mm');
  }

  // =========================================================================
  // 11. UNIT TEST: GERADOR DE ETIQUETA TÉRMICA ZEBRA 50x30mm (P&B, SEM BARCODE)
  // =========================================================================
  {
    const buf = buildThermalLabelsPdfBuffer([
      {
        label_id: 'lbl-1',
        protocol_code: '007412',
        barcode_value: '0074120571',
        patient_name: 'Gabrielle',
        species: 'Canino',
        tutor_name: 'Ana Karolina',
        vet_name: 'Dr. Carlos',
        exam_code: '057',
        exam_name: 'Hemograma Completo',
        section: 'Hematologia',
        material: 'Sangue',
        tube_type: 'tubo roxo com edta',
        label_index: 1,
        total_labels_for_exam: 2,
        created_at: '2026-11-17T10:00:00.000Z',
      },
      {
        label_id: 'lbl-2',
        protocol_code: '007412',
        barcode_value: '0074120781',
        patient_name: 'Gabrielle',
        species: 'Canino',
        tutor_name: 'Ana Karolina',
        vet_name: 'Dr. Carlos',
        exam_code: '078',
        exam_name: 'Perfil Renal',
        section: 'Bioquímica',
        material: 'Soro',
        tube_type: 'tubo amarelo com gel separador',
        label_index: 2,
        total_labels_for_exam: 2,
        created_at: '2026-11-17T10:00:00.000Z',
      },
    ]);
    const txt = buf.toString('latin1');
    assert.ok(txt.startsWith('%PDF-1.4'));
    assert.ok(txt.includes('/Count 2'), 'PDF deve gerar 1 página por etiqueta (2 páginas)');
    assert.ok(txt.includes('/MediaBox [0 0 141.73 85.04]'), 'Tamanho exato 50mm x 30mm');
    assert.ok(txt.includes('Material: Sangue'), 'Deve conter Material: Sangue');
    assert.ok(txt.includes('Tubo: tubo roxo'), 'Deve conter tipo de tubo');
    assert.ok(txt.includes('edta'), 'Deve preservar continuação da linha quebrada do tubo');
    assert.ok(txt.includes('057'));
    assert.ok(txt.includes('078'));
    assert.ok(!txt.includes('0074120571'), 'Não deve renderizar valor de código de barras');
    console.log('✅ [11/11] Unit Test: buildThermalLabelsPdfBuffer (50x30mm, P&B, sem código de barras)');
  }

  console.log('\n🎉 TODOS OS 11 GRUPOS DE TESTES UNITÁRIOS DE CRUD, AGENDAMENTO E ETIQUETAS PASSARAM!');
}

runCrudUnitTests().catch((err) => {
  console.error('❌ Falha nos testes unitários:', err);
  process.exit(1);
});
