import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../domain/errors/AppError';

const FRIENDLY_FIELD_LABELS: Record<string, string> = {
  email: 'E-mail',
  password: 'Senha',
  crmv: 'CRMV',
  name: 'Nome',
  code: 'Código do exame',
  section: 'Seção técnica',
  delivery_days: 'Prazo de entrega',
  tube_type: 'Tipo de tubo/amostra',
  label_qty: 'Quantidade de etiquetas',
  start_date: 'Data inicial de vigência',
  end_date: 'Data final de vigência',
  exam_id: 'Exame',
  species: 'Espécie',
  gender: 'Sexo',
  reference_text_content: 'Valores de referência',
  clinic_or_tutor_name: 'Nome da clínica ou tutor',
  phone: 'Telefone',
  address: 'Endereço de coleta',
  preferred_date: 'Data preferencial',
  scheduled_date: 'Data do agendamento',
  scheduled_time: 'Horário do agendamento',
  field_name: 'Identificador do campo',
  field_label: 'Rótulo do campo',
  tutor_name: 'Nome do tutor',
  tutor_phone: 'Telefone do tutor',
};

function translateDatabaseError(rawMessage: string): { status: number; code: string; message: string } | null {
  const lower = rawMessage.toLowerCase();

  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    if (lower.includes('email')) {
      return {
        status: 409,
        code: 'CONFLICT_ERROR',
        message: 'Já existe um cadastro utilizando este e-mail. Verifique os dados ou use outro e-mail.',
      };
    }
    if (lower.includes('code')) {
      return {
        status: 409,
        code: 'CONFLICT_ERROR',
        message: 'Já existe um exame cadastrado com este código. Escolha outro código.',
      };
    }
    if (lower.includes('crmv')) {
      return {
        status: 409,
        code: 'CONFLICT_ERROR',
        message: 'Já existe um veterinário cadastrado com este CRMV.',
      };
    }
    if (lower.includes('protocol')) {
      return {
        status: 409,
        code: 'CONFLICT_ERROR',
        message: 'Já existe um atendimento registrado com este número de protocolo. Tente novamente.',
      };
    }
    return {
      status: 409,
      code: 'CONFLICT_ERROR',
      message: 'Já existe um registro cadastrado com essas informações.',
    };
  }

  if (lower.includes('foreign key constraint') || lower.includes('violates foreign key')) {
    if (lower.includes('delete')) {
      return {
        status: 409,
        code: 'CONFLICT_ERROR',
        message: 'Não é possível excluir este registro porque ele já está vinculado a atendimentos ou exames.',
      };
    }
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Um dos registros selecionados não foi encontrado. Atualize a página e tente novamente.',
    };
  }

  if (lower.includes('invalid input syntax for type uuid')) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'O registro solicitado não foi encontrado.',
    };
  }

  if (lower.includes('not-null constraint') || lower.includes('null value in column')) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Alguns campos obrigatórios não foram preenchidos. Revise o formulário e tente novamente.',
    };
  }

  if (lower.includes('check constraint')) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Um dos valores informados está fora do padrão permitido. Revise os campos e tente novamente.',
    };
  }

  return null;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((issue) => {
      const rawField = issue.path.join('.');
      const friendlyField = FRIENDLY_FIELD_LABELS[rawField] || rawField;
      const friendlyMsg =
        issue.message === 'Required'
          ? 'Preenchimento obrigatório.'
          : issue.message.startsWith('Invalid enum value')
          ? 'Selecione uma opção válida.'
          : issue.message;
      return {
        field: friendlyField,
        message: friendlyMsg,
      };
    });

    const firstIssue = formattedIssues[0];
    const detailedMessage = firstIssue
      ? firstIssue.field && !firstIssue.message.toLowerCase().includes(firstIssue.field.toLowerCase())
        ? `${firstIssue.field}: ${firstIssue.message}`
        : firstIssue.message
      : 'Alguns dados informados estão incompletos ou inválidos. Revise os campos obrigatórios.';

    res.status(400).json({
      success: false,
      message: detailedMessage,
      error: {
        code: 'VALIDATION_ERROR',
        message: detailedMessage,
        details: formattedIssues,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof Error) {
    const translated = translateDatabaseError(err.message);
    if (translated) {
      res.status(translated.status).json({
        success: false,
        message: translated.message,
        error: {
          code: translated.code,
          message: translated.message,
        },
      });
      return;
    }
  }

  const friendlyFallback =
    'Ocorreu uma instabilidade temporária ao processar sua solicitação. Tente novamente em instantes.';

  res.status(500).json({
    success: false,
    message: friendlyFallback,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: friendlyFallback,
    },
  });
}
