import { describe, expect, it } from 'vitest';
import { MarcImportError, parseIso2709, parseMarcData, parseMarcXml } from './marc';

const encoder = new TextEncoder();

function isoRecord(title: string, utf8 = true): Uint8Array {
  const fields = [
    { tag: '001', data: encoder.encode('control-1') },
    { tag: '245', data: encoder.encode(`10\x1fa${title}\x1fbA subtitle`) },
    { tag: '650', data: encoder.encode('  \x1faLibraries') },
  ].map((field) => ({ ...field, bytes: new Uint8Array([...field.data, 0x1e]) }));
  const baseAddress = 24 + fields.length * 12 + 1;
  const recordLength = baseAddress + fields.reduce((sum, field) => sum + field.bytes.length, 0) + 1;
  const leader = Array<string>(24).fill(' ');
  String(recordLength).padStart(5, '0').split('').forEach((value, index) => { leader[index] = value; });
  leader[5] = 'n';
  leader[6] = 'a';
  leader[7] = 'm';
  leader[9] = utf8 ? 'a' : ' ';
  leader[10] = '2';
  leader[11] = '2';
  String(baseAddress).padStart(5, '0').split('').forEach((value, index) => { leader[index + 12] = value; });
  '4500'.split('').forEach((value, index) => { leader[index + 20] = value; });

  let position = 0;
  const directory = fields.map((field) => {
    const entry = `${field.tag}${String(field.bytes.length).padStart(4, '0')}${String(position).padStart(5, '0')}`;
    position += field.bytes.length;
    return entry;
  }).join('');
  const output = new Uint8Array(recordLength);
  let offset = 0;
  for (const part of [encoder.encode(leader.join('')), encoder.encode(directory), new Uint8Array([0x1e]), ...fields.map((field) => field.bytes), new Uint8Array([0x1d])]) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

describe('MARC import', () => {
  it('normalizes MARCXML records into CISIS fields while preserving MARC metadata', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
      <collection xmlns="http://www.loc.gov/MARC21/slim">
        <record>
          <leader>00000nam a2200000 a 4500</leader>
          <controlfield tag="001">control-1</controlfield>
          <datafield tag="245" ind1="1" ind2="0"><subfield code="a">A title</subfield><subfield code="b">A subtitle</subfield></datafield>
          <datafield tag="650" ind1=" " ind2="0"><subfield code="a">Libraries</subfield></datafield>
          <datafield tag="650" ind1=" " ind2="0"><subfield code="a">Catalogs</subfield></datafield>
        </record>
      </collection>`;

    const result = parseMarcXml(encoder.encode(source));

    expect(result.format).toBe('marcxml');
    expect(result.records).toHaveLength(1);
    expect(result.records[0].fields['000']).toEqual(['00000nam a2200000 a 4500']);
    expect(result.records[0].fields['001']).toEqual(['control-1']);
    expect(result.records[0].fields['245']).toEqual(['^aA title^bA subtitle']);
    expect(result.records[0].fields['650']).toEqual(['^aLibraries', '^aCatalogs']);
    expect(result.records[0].marc?.indicators['245']).toEqual(['10']);
  });

  it('parses concatenated UTF-8 ISO2709 records', () => {
    const first = isoRecord('Caf\u00e9 records');
    const second = isoRecord('Second record');
    const input = new Uint8Array(first.length + second.length);
    input.set(first);
    input.set(second, first.length);

    const result = parseIso2709(input);

    expect(result.records).toHaveLength(2);
    expect(result.records[0].fields['245']).toEqual(['^aCaf\u00e9 records^bA subtitle']);
    expect(result.records[0].marc?.indicators['245']).toEqual(['10']);
    expect(result.records[1].mfn).toBe(2);
  });

  it('detects both supported formats', () => {
    expect(parseMarcData(encoder.encode('<record xmlns="http://www.loc.gov/MARC21/slim"><leader>00000nam a2200000 a 4500</leader></record>'), 'records.xml').format).toBe('marcxml');
    expect(parseMarcData(isoRecord('Detected'), 'records.mrc').format).toBe('iso2709');
  });

  it('rejects XML doctypes and record sets above the configured limit', () => {
    expect(() => parseMarcXml(encoder.encode('<!DOCTYPE collection><collection/>'))).toThrowError(MarcImportError);
    const source = '<collection xmlns="http://www.loc.gov/MARC21/slim"><record/><record/></collection>';
    expect(() => parseMarcXml(encoder.encode(source), { maxRecords: 1 })).toThrow(/more than 1 records/);
  });

  it('rejects non-ASCII MARC-8 rather than corrupting characters', () => {
    const record = isoRecord('Non-ASCII', false);
    const marker = encoder.encode('Non-ASCII');
    const start = record.findIndex((_, index) => marker.every((byte, markerIndex) => record[index + markerIndex] === byte));
    record[start] = 0xe1;
    expect(() => parseIso2709(record)).toThrow(/MARC-8 characters/);
  });

  it('rejects a zero-length ISO2709 record without retrying the same bytes', () => {
    expect(() => parseIso2709(encoder.encode('00000'))).toThrow(/invalid length of 0/);
  });

  it('imports 10,000 MARCXML records at the supported boundary', () => {
    const body = Array.from({ length: 10_000 }, (_, index) => `<record><leader>00000nam a2200000 a 4500</leader><controlfield tag="001">${index + 1}</controlfield><datafield tag="245" ind1="1" ind2="0"><subfield code="a">Title ${index + 1}</subfield></datafield></record>`).join('');
    const result = parseMarcXml(encoder.encode(`<collection xmlns="http://www.loc.gov/MARC21/slim">${body}</collection>`));
    expect(result.records).toHaveLength(10_000);
    expect(result.records[9_999].fields['245']).toEqual(['^aTitle 10000']);
  });
});
