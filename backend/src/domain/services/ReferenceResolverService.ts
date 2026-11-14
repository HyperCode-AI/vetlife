import { ExamReference, Patient } from '../entities';

/**
 * SRP: Domain service responsible for HU-04
 * ("valores de referência dos exames cruzando espécie, sexo e faixa etária inicial/final em dias/meses").
 */
export class ReferenceResolverService {
  public calculateAgeInDays(birthDate: string, referenceDate?: string): number {
    const birth = new Date(birthDate);
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    if (Number.isNaN(birth.getTime())) {
      return 365;
    }
    const diffMs = Math.max(0, ref.getTime() - birth.getTime());
    return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  public formatAgeLabel(ageDays: number): string {
    if (ageDays < 30) {
      return `${ageDays} dia(s)`;
    }
    if (ageDays < 365) {
      const months = Math.max(1, Math.floor(ageDays / 30));
      return `${months} mês(es) (${ageDays} dias)`;
    }
    const years = Math.floor(ageDays / 365);
    const remMonths = Math.floor((ageDays % 365) / 30);
    return remMonths > 0
      ? `${years} ano(s) e ${remMonths} mês(es) (${ageDays} dias)`
      : `${years} ano(s) (${ageDays} dias)`;
  }

  public enrichPatientWithAge(patient: Patient): Patient {
    const ageDays =
      typeof patient.age_days === 'number' && patient.age_days > 0
        ? patient.age_days
        : this.calculateAgeInDays(patient.birth_date);
    return {
      ...patient,
      age_days: ageDays,
      age_label: this.formatAgeLabel(ageDays),
    };
  }

  public resolveReferencesForPatient(
    allReferences: ExamReference[],
    examId: string,
    species: string,
    gender: string,
    ageDays: number
  ): ExamReference[] {
    const normalizedSpecies = (species || '').trim().toLowerCase();
    const normalizedGender = (gender || 'Ambos').trim().toUpperCase();

    const examRefs = allReferences.filter((ref) => ref.exam_id === examId);

    const exactMatches = examRefs.filter((ref) => {
      const speciesMatch =
        ref.species.trim().toLowerCase() === normalizedSpecies ||
        ref.species.trim().toLowerCase() === 'todos';
      const genderMatch =
        ref.gender === 'Ambos' || ref.gender.toUpperCase() === normalizedGender;
      const ageMatch = ageDays >= ref.min_age_days && ageDays <= ref.max_age_days;
      return speciesMatch && genderMatch && ageMatch;
    });

    if (exactMatches.length > 0) {
      return exactMatches;
    }

    // Fallback to same species regardless of age range if specific age bracket not found
    const speciesMatches = examRefs.filter(
      (ref) => ref.species.trim().toLowerCase() === normalizedSpecies
    );
    return speciesMatches.length > 0 ? speciesMatches : examRefs;
  }

  public buildReferenceSnapshotText(references: ExamReference[]): string {
    if (!references || references.length === 0) {
      return 'Valores de referência padrão segundo literatura médico-veterinária vigente.';
    }
    return references
      .map((ref) => {
        const rangeLabel = `${ref.species} | Sexo: ${ref.gender} | Idade: ${ref.min_age_days} a ${ref.max_age_days} dias`;
        return `[${rangeLabel}] ${ref.reference_text_content}`;
      })
      .join('\n');
  }
}
