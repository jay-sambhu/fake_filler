import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearSnapshot, fillPage, fillPageAsync, matchesGenderText, revertForm } from '../src/content/filler';
import { scanFormFields } from '../src/content/detector';
import { matchDomainRule, FieldMappingRule } from '../src/services/domainMapping';
import { generateSyntheticPerson } from '../src/generator/personGenerator';
import { FillOptions, SyntheticPerson } from '../src/types';

const OPTIONS: FillOptions = {
  profile: 'general',
  fillScript: 'en',
  fillCategories: { personal: true, contact: true, address: true, professional: true },
};

function personWithGender(gender: 'Male' | 'Female' | 'Other'): SyntheticPerson {
  return { ...generateSyntheticPerson('general'), gender };
}

describe('Fill regressions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearSnapshot();
  });

  describe('gender matching', () => {
    it('does not treat "female" as a match for male (substring bug)', () => {
      expect(matchesGenderText('female', 'Male')).toBe(false);
      expect(matchesGenderText('Female', 'Female')).toBe(true);
      expect(matchesGenderText('male', 'Male')).toBe(true);
      expect(matchesGenderText('', 'Male')).toBe(false);
      expect(matchesGenderText('M', 'Male')).toBe(true);
      expect(matchesGenderText('F', 'Male')).toBe(false);
      expect(matchesGenderText('महिला (Female)', 'Female')).toBe(true);
      expect(matchesGenderText('पुरुष', 'Male')).toBe(true);
    });

    it.each(['Male', 'Female', 'Other'] as const)('checks the %s radio even when Female is listed first', (gender) => {
      document.body.innerHTML = `
        <fieldset><legend>Gender</legend>
          <label><input type="radio" name="gender" value="female"> Female</label>
          <label><input type="radio" name="gender" value="male"> Male</label>
          <label><input type="radio" name="gender" value="other"> Other</label>
          <label><input type="radio" name="gender" value=""> Prefer not to say</label>
        </fieldset>`;
      fillPage(personWithGender(gender), OPTIONS);
      const checked = document.querySelector<HTMLInputElement>('input[name="gender"]:checked');
      expect(checked?.value).toBe(gender.toLowerCase());
    });

    it.each(['Male', 'Female'] as const)('selects %s in a gender dropdown that lists Female first', (gender) => {
      document.body.innerHTML = `
        <label for="g">Gender</label>
        <select id="g" name="gender"><option value="">Select</option><option>Female</option><option>Male</option></select>`;
      fillPage(personWithGender(gender), OPTIONS);
      expect(document.querySelector<HTMLSelectElement>('#g')!.value).toBe(gender);
    });
  });

  it('selects ward "1" exactly instead of the first option containing "1"', () => {
    const person = generateSyntheticPerson('general');
    const ward = 1;
    const p: SyntheticPerson = {
      ...person,
      address: { ...person.address, ward },
      permanentAddress: person.permanentAddress ? { ...person.permanentAddress, ward } : undefined,
    };
    document.body.innerHTML = `
      <label for="w">Ward No</label>
      <select id="w" name="ward"><option value="">--</option><option>10</option><option>11</option><option>1</option></select>`;
    fillPage(p, OPTIONS);
    expect(document.querySelector<HTMLSelectElement>('#w')!.value).toBe('1');
  });

  it('skips file, search, readonly and hidden inputs without aborting the fill', () => {
    document.body.innerHTML = `
      <label for="doc">Citizenship copy</label><input id="doc" type="file" name="citizenship">
      <label for="q">Search</label><input id="q" type="search" name="q">
      <label for="ro">Full name</label><input id="ro" name="full_name_ro" readonly value="locked">
      <input id="hp" name="email_hp" hidden>
      <label for="name">Full name</label><input id="name" name="full_name">`;
    const types = scanFormFields().map((f) => f.element.id);
    expect(types).toEqual(['name']);

    const result = fillPage(generateSyntheticPerson('general'), OPTIONS);
    expect(result.fieldsFilledCount).toBe(1);
    expect(document.querySelector<HTMLInputElement>('#ro')!.value).toBe('locked');
  });

  it('keeps filling when one field throws from its value setter', () => {
    document.body.innerHTML = `
      <label for="a">Email</label><input id="a" type="email" name="email">
      <label for="b">Full name</label><input id="b" name="full_name">`;
    const bad = document.querySelector<HTMLInputElement>('#a')!;
    Object.defineProperty(bad, 'value', {
      configurable: true,
      get: () => '',
      set: () => {
        throw new Error('framework setter exploded');
      },
    });
    const result = fillPage(generateSyntheticPerson('general'), OPTIONS);
    expect(document.querySelector<HTMLInputElement>('#b')!.value).not.toBe('');
    expect(result.fieldsFilledCount).toBeGreaterThanOrEqual(1);
  });

  it('fills number inputs with ASCII digits even in Nepali script mode', () => {
    document.body.innerHTML = `
      <h3>Permanent Address</h3>
      <label for="w">Ward Number (वडा नं.)</label><input id="w" type="number" name="ward" min="1" max="35">
      <label for="d">District (जिल्ला)</label><input id="d" name="district">`;
    const person = generateSyntheticPerson('general');
    fillPage(person, { ...OPTIONS, fillScript: 'np' });
    expect(document.querySelector<HTMLInputElement>('#w')!.value).toMatch(/^\d+$/);
  });

  it('fills bilingual labels in the script the user chose', () => {
    document.body.innerHTML = `<label for="d">District (जिल्ला)</label><input id="d" name="district">`;
    fillPage(generateSyntheticPerson('general'), OPTIONS);
    expect(document.querySelector<HTMLInputElement>('#d')!.value).toMatch(/^[A-Za-z ]+$/);
  });

  it('respects maxlength', () => {
    document.body.innerHTML = `<label for="n">Full name</label><input id="n" name="full_name" maxlength="4">`;
    fillPage(generateSyntheticPerson('general'), OPTIONS);
    expect(document.querySelector<HTMLInputElement>('#n')!.value.length).toBe(4);
  });

  it('undo after filling twice restores the values from before the first fill', () => {
    document.body.innerHTML = `<label for="n">Full name</label><input id="n" name="full_name" value="Original">`;
    fillPage(generateSyntheticPerson('general'), OPTIONS);
    fillPage(generateSyntheticPerson('general'), OPTIONS);
    revertForm(document);
    expect(document.querySelector<HTMLInputElement>('#n')!.value).toBe('Original');
  });

  it('routes unknown fields through an injected classifier and caps the batch', async () => {
    document.body.innerHTML = Array.from({ length: 30 }, (_, i) => `<input name="zzq_${i}" type="text">`).join('');
    const classify = vi.fn(async () => ({ fieldType: 'phone' as const, confidence: 0.9 }));
    const result = await fillPageAsync(
      generateSyntheticPerson('general'),
      { ...OPTIONS, enableAiClassification: true },
      undefined,
      document,
      [],
      classify
    );
    expect(classify).toHaveBeenCalledTimes(25);
    expect(result.fieldsFilledCount).toBeGreaterThanOrEqual(25);
  });

  it('does not call the classifier when AI is disabled', async () => {
    document.body.innerHTML = `<input name="zzq_1" type="text">`;
    const classify = vi.fn();
    await fillPageAsync(generateSyntheticPerson('general'), OPTIONS, undefined, document, [], classify);
    expect(classify).not.toHaveBeenCalled();
  });

  it('ignores malformed domain rules instead of throwing', () => {
    const input = document.createElement('input');
    input.name = 'x';
    const rules = [{ targetType: 'phone' } as unknown as FieldMappingRule, { selectorOrName: 'x', targetType: 'email' } as FieldMappingRule];
    expect(matchDomainRule(input, rules)?.targetType).toBe('email');
  });

  it('puts a plain number into number inputs (salary "45,000 NPR" was rejected)', () => {
    document.body.innerHTML = `<label for="s">Gross Monthly Salary (NPR)</label><input type="number" id="s" name="salary">`;
    fillPage({ ...generateSyntheticPerson('employee'), salary: '45,000 NPR' }, OPTIONS);
    expect((document.getElementById('s') as HTMLInputElement).value).toBe('45000');
  });

  it('does not pick a placeholder option that shares a word with the value', () => {
    document.body.innerHTML = `
      <label for="f">Academic Faculty / Department</label>
      <select id="f" name="faculty">
        <option value="">-- Select Faculty --</option>
        <option value="ioe">Institute of Engineering (IOE)</option>
        <option value="iost">Institute of Science &amp; Technology (IoST)</option>
        <option value="fom">Faculty of Management</option>
      </select>`;
    fillPage({ ...generateSyntheticPerson('general'), faculty: 'Faculty of Science & Technology' }, OPTIONS);
    expect((document.getElementById('f') as HTMLSelectElement).value).toBe('iost');
  });

  it('gives email inputs an email even when autocomplete says username', () => {
    document.body.innerHTML = `<label for="e">Email or phone</label><input type="email" id="e" name="identifier" autocomplete="username">`;
    expect(scanFormFields(document)[0].type).toBe('email');
  });

  it('treats an "Email or phone" username field as email (Google sign-in)', () => {
    document.body.innerHTML = `<label for="e">Email or phone</label><input type="text" id="e" name="identifier" autocomplete="username">`;
    expect(scanFormFields(document)[0].type).toBe('email');
  });

  it.each(['जन्म स्थान', 'Place of Birth'])('detects "%s" as the birth district', (label) => {
    document.body.innerHTML = `<label for="p">${label}</label><input type="text" id="p" name="pob">`;
    expect(scanFormFields(document)[0].type).toBe('district');
  });
});
