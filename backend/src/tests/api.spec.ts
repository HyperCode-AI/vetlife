import assert from 'assert';
import { EventEmitter } from 'events';
import { app } from '../app';

/**
 * In-process Express dispatcher so integration tests run in <100ms
 * without requiring TCP socket binding.
 */
async function invokeApp(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
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
      _body: true, // tells express.json() that body is already parsed
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
        resolve({ status: statusCode, json: payload });
        return this;
      },
      send(payload: unknown) {
        this.headersSent = true;
        if (typeof payload === 'string') {
          try {
            resolve({ status: statusCode, json: JSON.parse(payload) });
          } catch {
            resolve({ status: statusCode, json: payload });
          }
        } else {
          resolve({ status: statusCode, json: payload });
        }
        return this;
      },
      end(chunk?: string | Buffer) {
        this.headersSent = true;
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: statusCode, json: raw ? JSON.parse(raw) : {} });
        } catch {
          resolve({ status: statusCode, json: raw });
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

async function runIntegrationTests(): Promise<void> {
  console.log('🧪 Iniciando suíte de testes de integração VetLife API...');

  // 1. Healthcheck
  const health = await invokeApp('GET', '/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.json.success, true);
  console.log('✅ [1/10] Healthcheck operacional');

  // 2. Auth Interno (Admin & Biomédico criado para teste)
  const adminLogin = await invokeApp('POST', '/auth/login', {
    email: 'admin@vetlifelab.com.br',
    password: 'VetLifeL@b2026',
  });
  assert.strictEqual(adminLogin.status, 200);
  const adminToken: string = adminLogin.json.token;
  assert.ok(adminToken, 'Token Admin deve ser emitido');

  const createBioUser = await invokeApp(
    'POST',
    '/users',
    {
      name: 'Biomédico Teste',
      email: 'biomedico.teste@vetlifelab.com.br',
      password: 'BioTest@2026',
      role: 'biomedical',
    },
    adminToken
  );
  assert.strictEqual(createBioUser.status, 201);

  const biomedLogin = await invokeApp('POST', '/auth/login', {
    email: 'biomedico.teste@vetlifelab.com.br',
    password: 'BioTest@2026',
  });
  assert.strictEqual(biomedLogin.status, 200);
  const biomedToken: string = biomedLogin.json.token;
  assert.ok(biomedToken, 'Token Biomédico deve ser emitido');
  console.log('✅ [2/10] Autenticação JWT Admin e Biomédico validada');

  // 3. RN-01: Biomédico bloqueado em Configurações e Financeiro; Admin permitido
  const forbiddenExamCreate = await invokeApp(
    'POST',
    '/exams',
    {
      code: 'TSH-005',
      name: 'Dosagem de TSH e T4 Livre',
      section: 'Endocrinologia',
      delivery_days: 2,
      tube_type: 'Tubo Gel Separador',
      label_qty: 1,
    },
    biomedToken
  );
  assert.strictEqual(
    forbiddenExamCreate.status,
    403,
    'Biomédico deve receber 403 ao tentar criar exame (RN-01)'
  );

  const forbiddenFinDash = await invokeApp('GET', '/dashboard/financial', undefined, biomedToken);
  assert.strictEqual(
    forbiddenFinDash.status,
    403,
    'Biomédico deve receber 403 no Dashboard Financeiro (RN-01)'
  );

  const allowedFinDash = await invokeApp('GET', '/dashboard/financial', undefined, adminToken);
  assert.strictEqual(allowedFinDash.status, 200);
  assert.ok(allowedFinDash.json.data.balance_sheet, 'Admin deve acessar balancete financeiro');
  console.log('✅ [3/10] Regra de Negócio RN-01 (RBAC estrito Admin vs Biomédico) validada');

  // 4. HU-01 & HU-02: Catálogo Oficial 2026 (195+ exames com prazo e preço vigente) + Cadastro/Edição Admin
  const unauthExams = await invokeApp('GET', '/exams');
  assert.strictEqual(unauthExams.status, 401, 'GET /exams sem token deve retornar 401');

  const catalogList = await invokeApp('GET', '/exams', undefined, adminToken);
  assert.strictEqual(catalogList.status, 200);
  assert.ok(
    catalogList.json.data.length >= 195,
    `Catálogo 2026 deve conter ao menos 195 exames do PDF (encontrados: ${catalogList.json.data.length})`
  );
  const sampleExam000 = catalogList.json.data.find((e: any) => e.code === '000');
  assert.ok(sampleExam000, 'Exame código 000 deve existir no catálogo');
  assert.strictEqual(sampleExam000.price, 83);
  assert.strictEqual(sampleExam000.delivery_days, 1);
  assert.ok(sampleExam000.delivery_time_label, 'delivery_time_label deve estar presente');

  const createdExam = await invokeApp(
    'POST',
    '/exams',
    {
      code: 'END-999',
      name: 'Painel Tireoidiano Especial (T4 Livre por Diálise + TSH)',
      section: 'Hormônios e Endocrinologia',
      delivery_days: 2,
      delivery_time_label: '2 dias úteis',
      tube_type: 'Tubo Tampa Vermelha (Soro)',
      label_qty: 2,
      price: 135,
    },
    adminToken
  );
  assert.strictEqual(createdExam.status, 201);
  const newExamId = createdExam.json.data.id;
  assert.strictEqual(createdExam.json.data.delivery_days, 2);
  assert.strictEqual(createdExam.json.data.delivery_time_label, '2 dias úteis');
  assert.strictEqual(createdExam.json.data.price, 135);

  const updatedExamRes = await invokeApp(
    'PUT',
    `/exams/${newExamId}`,
    {
      delivery_days: 3,
      delivery_time_label: '3 dias úteis',
      price: 149,
    },
    adminToken
  );
  assert.strictEqual(updatedExamRes.status, 200);
  assert.strictEqual(updatedExamRes.json.data.delivery_days, 3);
  assert.strictEqual(updatedExamRes.json.data.delivery_time_label, '3 dias úteis');
  assert.strictEqual(updatedExamRes.json.data.price, 149);

  const addedField = await invokeApp(
    'POST',
    `/exams/${newExamId}/fields`,
    {
      field_name: 't4_livre_dialise',
      field_label: 'T4 Livre por Diálise de Equilíbrio',
      field_type: 'number',
      unit: 'ng/dL',
      is_required: true,
      display_order: 1,
    },
    adminToken
  );
  assert.strictEqual(addedField.status, 201);
  console.log('✅ [4/10] Catálogo Oficial 2026 (195+ exames, prazos e preços) + CRUD Admin validados');

  // 5. HU-03 & RN-04: Tabelas de Preços com Vigência
  const activePricing = await invokeApp(
    'GET',
    '/price-tables/active?date=2026-03-13',
    undefined,
    adminToken
  );
  assert.strictEqual(activePricing.status, 200);
  assert.ok(activePricing.json.data.activeTable, 'Tabela ativa na vigência deve ser retornada');
  console.log('✅ [5/10] HU-03 & RN-04 (Tabelas de preços com vigência) validados');

  // 6. HU-04 & HU-05: Valores de Referência por Espécie/Sexo/Idade e Modelos de Laudo
  const createdRef = await invokeApp(
    'POST',
    '/exam-references',
    {
      exam_id: newExamId,
      species: 'Canino',
      gender: 'Ambos',
      min_age_days: 180,
      max_age_days: 5475,
      reference_text_content: 'T4 Livre: 0,8 a 2,6 ng/dL | TSH Canino: até 0,50 ng/mL',
    },
    adminToken
  );
  assert.strictEqual(createdRef.status, 201);

  const templates = await invokeApp('GET', '/report-templates', undefined, adminToken);
  assert.strictEqual(templates.status, 200);
  assert.ok(templates.json.data.length >= 2);
  console.log('✅ [6/10] HU-04 & HU-05 (Valores de referência e templates de laudo) validados');

  // 7. HU-06, HU-07, HU-08, HU-09, RN-03, RN-04: Biomédico cria pedido, gera etiquetas, lança resultados dinâmicos + anexo e libera laudo
  const vetsListRes = await invokeApp('GET', '/vets', undefined, biomedToken);
  assert.strictEqual(vetsListRes.status, 200);
  const firstVetId = vetsListRes.json.data[0].id;
  const examsListRes = await invokeApp('GET', '/exams', undefined, biomedToken);
  assert.strictEqual(examsListRes.status, 200);
  const hemogramaExam = examsListRes.json.data.find((e: any) => e.code === '057');
  assert.ok(hemogramaExam);
  assert.strictEqual(
    hemogramaExam.price,
    undefined,
    'Biomédico não deve visualizar preços de exames (RBAC ocultação de valores)'
  );
  const forbiddenPriceTablesBiomed = await invokeApp(
    'GET',
    '/price-tables',
    undefined,
    biomedToken
  );
  assert.strictEqual(
    forbiddenPriceTablesBiomed.status,
    403,
    'Biomédico deve receber 403 ao consultar tabelas de preços'
  );

  const newOrder = await invokeApp(
    'POST',
    '/orders',
    {
      patient: {
        name: 'Apollo',
        species: 'Canino',
        breed: 'Pastor Alemão',
        gender: 'M',
        birth_date: '2023-05-10',
        tutor_name: 'Eduardo Fontes',
        tutor_phone: '(11) 98877-6655',
      },
      vet_id: firstVetId,
      exam_ids: [newExamId, hemogramaExam.id],
      notes: 'Suspeita clínica de hipotireoidismo.',
    },
    biomedToken
  );
  assert.strictEqual(newOrder.status, 201);
  const createdOrder = newOrder.json.data;
  assert.ok(createdOrder.protocol_code.startsWith('VET-2026-'));
  assert.strictEqual(
    createdOrder.total_amount,
    0,
    'Biomédico não deve visualizar valor total do atendimento'
  );

  // Etiquetas de coleta
  const labelsRes = await invokeApp(
    'GET',
    `/orders/${createdOrder.id}/labels`,
    undefined,
    biomedToken
  );
  assert.strictEqual(labelsRes.status, 200);
  assert.strictEqual(labelsRes.json.data.total_labels, 4); // 2 + 2

  // Lançamento de resultado dinâmico + anexo (HU-07, HU-08, RN-03)
  const firstResultId = createdOrder.results[0].id;
  const updatedOrderRes = await invokeApp(
    'PUT',
    `/orders/${createdOrder.id}/results/${firstResultId}`,
    {
      dynamic_content: {
        t4_livre_dialise: 0.55,
      },
      attachments: [
        {
          name: 'Ultrassom_Tireoide_Apollo.pdf',
          type: 'ultrasound',
          url: 'https://vetlifelab.com.br/laudos/anexos/apollo-usg-tireoide.pdf',
        },
      ],
    },
    biomedToken
  );
  assert.strictEqual(updatedOrderRes.status, 200);
  assert.strictEqual(updatedOrderRes.json.data.status, 'em_analise');

  // Liberação do laudo (HU-09)
  const releasedRes = await invokeApp(
    'POST',
    `/orders/${createdOrder.id}/release`,
    { notes: 'Laudo revisado e assinado digitalmente.' },
    biomedToken
  );
  assert.strictEqual(releasedRes.status, 200);
  assert.strictEqual(releasedRes.json.data.status, 'concluido');
  console.log(
    '✅ [7/10] HU-06 a HU-09 (Atendimento, etiquetas, campos dinâmicos, anexos e liberação) validados'
  );

  // 8. HU-10 & HU-11: Portal do Veterinário (Login via E-mail + Senha e bloqueio de acesso apenas por CRMV)
  const vetLoginByCrmvOnly = await invokeApp('POST', '/auth/vet-login', {
    email: 'carlos.silva@clinicapetcare.com.br',
    password: 'CRMV-SP 45890',
  });
  assert.strictEqual(
    vetLoginByCrmvOnly.status,
    401,
    'Login no Portal do Veterinário apenas com CRMV como senha deve ser bloqueado (401)'
  );

  const vetLogin = await invokeApp('POST', '/auth/vet-login', {
    email: 'carlos.silva@clinicapetcare.com.br',
    password: 'Vet@2026',
  });
  assert.strictEqual(vetLogin.status, 200);
  const vetToken: string = vetLogin.json.token;

  const vetOrders = await invokeApp('GET', '/vet/orders', undefined, vetToken);
  assert.strictEqual(vetOrders.status, 200);
  assert.ok(vetOrders.json.data.length >= 2);

  // Segurança estrita: rotas laboratoriais e veterinárias sem token retornam 401; vet bloqueado em rotas do laboratório (403)
  for (const protectedPath of [
    '/patients',
    '/vets',
    '/orders',
    '/price-tables',
    '/exam-references',
    '/report-templates',
    '/collection-requests',
    '/vet/orders',
    '/dashboard/operational',
    '/dashboard/financial',
  ]) {
    const unauthRes = await invokeApp('GET', protectedPath);
    assert.strictEqual(
      unauthRes.status,
      401,
      `Rota protegida ${protectedPath} deve bloquear acesso externo sem token (401)`
    );
  }
  const vetBlockedInLab = await invokeApp('GET', '/orders', undefined, vetToken);
  assert.strictEqual(
    vetBlockedInLab.status,
    403,
    'Token de veterinário não pode acessar rotas da área laboratorial (403)'
  );
  console.log('✅ [8/10] HU-10 & HU-11 (Portal do Veterinário + Bloqueio 401/403 de rotas protegidas) validados');

  // 9. HU-12 & RN-02: Consulta Pública do Tutor por Protocolo (sem senha)
  const publicProtocol = await invokeApp('GET', '/public/protocol/VET-2026-0001');
  assert.strictEqual(publicProtocol.status, 200);
  assert.strictEqual(publicProtocol.json.data.protocol_code, 'VET-2026-0001');
  assert.ok(publicProtocol.json.data.combined_report_html.includes('Thor'));
  console.log(
    '✅ [9/10] HU-12 & RN-02 (Consulta pública do Tutor por protocolo sem senha) validada'
  );

  // 10. Solicitação de Coleta na Landing Page (CRMV obrigatório)
  const collectionReqNoCrmv = await invokeApp('POST', '/public/collection-requests', {
    clinic_or_tutor_name: 'Tutor Sem CRMV',
    phone: '(11) 97711-2233',
    email: 'tutor@email.com',
    address: 'Av. Paulista, 1500 - Bela Vista, São Paulo/SP',
  });
  assert.strictEqual(
    collectionReqNoCrmv.status,
    400,
    'Solicitação de coleta sem CRMV deve ser bloqueada (400)'
  );

  const collectionReq = await invokeApp('POST', '/public/collection-requests', {
    clinic_or_tutor_name: 'Clínica Amigo Fiel',
    crmv: 'CRMV-SP 41200',
    phone: '(11) 97711-2233',
    email: 'contato@amigofielvet.com.br',
    address: 'Av. Paulista, 1500 - Bela Vista, São Paulo/SP',
    notes: 'Coleta de 4 amostras urgentes até as 14h.',
  });
  assert.strictEqual(collectionReq.status, 201);
  assert.strictEqual(collectionReq.json.data.crmv, 'CRMV-SP 41200');
  console.log('✅ [10/10] Solicitação de coleta pública (com CRMV obrigatório) validada com sucesso!');

  console.log('\n🎉 TODOS OS TESTES DE INTEGRAÇÃO DO BACKEND PASSARAM COM SUCESSO!');
}

runIntegrationTests().catch((err) => {
  console.error('❌ Falha nos testes de integração:', err);
  process.exit(1);
});
