import {
  IRREGULAR_VERB_FORMS,
  genderVariants,
  pluralVariants,
  regularVerbForms,
  verbForms,
} from './morphology';

describe('Termo morphology', () => {
  describe('pluralVariants', () => {
    it('adds S after vowels', () => {
      expect(pluralVariants('livro')).toContain('LIVROS');
      expect(pluralVariants('casa')).toContain('CASAS');
    });

    it('adds ES after R, Z, and S', () => {
      expect(pluralVariants('flor')).toContain('FLORES');
      expect(pluralVariants('paz')).toContain('PAZES');
      expect(pluralVariants('pires')).toContain('PIRESES');
    });

    it('turns terminal M into NS', () => {
      expect(pluralVariants('bem')).toContain('BENS');
    });

    it('turns terminal L into IS', () => {
      expect(pluralVariants('papel')).toContain('PAPEIS');
      expect(pluralVariants('azul')).toContain('AZUIS');
    });

    it('uses OES as the default normalized AO plural', () => {
      expect(pluralVariants('nação')).toContain('NACOES');
      expect(pluralVariants('botao')).toContain('BOTOES');
    });
  });

  describe('genderVariants', () => {
    it('generates O to A variants', () => {
      expect(genderVariants('bonito')).toEqual(['BONITA']);
    });

    it('generates A to O variants', () => {
      expect(genderVariants('bonita')).toEqual(['BONITO']);
    });
  });

  describe('regularVerbForms', () => {
    it('generates common forms for regular AR verbs', () => {
      const forms = regularVerbForms('falar');
      expect(forms).toContain('FALO');
      expect(forms).toContain('FALOU');
      expect(forms).toContain('FALAVA');
      expect(forms).toContain('FALADO');
      expect(forms).toContain('FALANDO');
    });

    it('generates common forms for another regular AR verb', () => {
      const forms = regularVerbForms('amar');
      expect(forms).toContain('AMO');
      expect(forms).toContain('AMOU');
      expect(forms).toContain('AMADO');
      expect(forms).toContain('AMANDO');
    });

    it('generates common forms for regular ER verbs', () => {
      const forms = regularVerbForms('comer');
      expect(forms).toContain('COMO');
      expect(forms).toContain('COMEU');
      expect(forms).toContain('COMIA');
      expect(forms).toContain('COMIDO');
      expect(forms).toContain('COMENDO');
    });

    it('generates common forms for regular IR verbs', () => {
      const forms = regularVerbForms('abrir');
      expect(forms).toContain('ABRO');
      expect(forms).toContain('ABRIU');
      expect(forms).toContain('ABRIA');
      expect(forms).toContain('ABRIDO');
      expect(forms).toContain('ABRINDO');
    });
  });

  describe('irregular verbs', () => {
    it('covers ser explicitly', () => {
      const forms = verbForms('ser');
      expect(IRREGULAR_VERB_FORMS['SER']).toBeDefined();
      expect(forms).toContain('SOU');
      expect(forms).toContain('FUI');
      expect(forms).toContain('FORAM');
      expect(forms).toContain('SEJA');
    });

    it('covers ir explicitly', () => {
      const forms = verbForms('ir');
      expect(IRREGULAR_VERB_FORMS['IR']).toBeDefined();
      expect(forms).toContain('VOU');
      expect(forms).toContain('VAI');
      expect(forms).toContain('FOI');
      expect(forms).toContain('IREI');
    });
  });
});
