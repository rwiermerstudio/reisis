import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { IsisRecord } from './types';

export const MAX_IMPORT_RECORDS = 10_000;
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export type MarcImportFormat = 'marcxml' | 'iso2709';

export interface MarcImportWarning {
  code: string;
  message: string;
  record?: number;
  offset?: number;
}

export interface MarcImportResult {
  format: MarcImportFormat;
  records: IsisRecord[];
  warnings: MarcImportWarning[];
}

export interface MarcImportOptions {
  maxRecords?: number;
  onProgress?: (processedBytes: number, totalBytes: number) => void;
}

export class MarcImportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MarcImportError';
  }
}

interface RecordBuilder {
  leader?: string;
  fields: Record<string, string[]>;
  indicators: Record<string, string[]>;
}

function addField(builder: RecordBuilder, tag: string, value: string, indicators?: string): void {
  (builder.fields[tag] ??= []).push(value);
  if (indicators !== undefined) (builder.indicators[tag] ??= []).push(indicators);
}

function finishRecord(builder: RecordBuilder, mfn: number, sourceFormat: MarcImportFormat): IsisRecord {
  if (builder.leader !== undefined) builder.fields['000'] = [builder.leader];
  return {
    mfn,
    fields: builder.fields,
    marc: {
      sourceFormat,
      leader: builder.leader,
      indicators: builder.indicators,
    },
  };
}

function attribute(tag: SaxesTagNS, name: string): string | undefined {
  const direct = tag.attributes[name];
  if (direct) return direct.value;
  return Object.values(tag.attributes).find((item) => item.local === name)?.value;
}

export function parseMarcXml(data: Uint8Array, options: MarcImportOptions = {}): MarcImportResult {
  const maxRecords = options.maxRecords ?? MAX_IMPORT_RECORDS;
  const records: IsisRecord[] = [];
  const warnings: MarcImportWarning[] = [];
  const parser = new SaxesParser({ xmlns: true, position: true });
  let builder: RecordBuilder | undefined;
  let textTarget: 'leader' | 'controlfield' | 'subfield' | undefined;
  let text = '';
  let controlTag = '';
  let dataTag = '';
  let dataIndicators = '  ';
  let dataSubfields: Array<{ code: string; value: string }> = [];
  let subfieldCode = '';

  const startText = (target: typeof textTarget) => {
    textTarget = target;
    text = '';
  };
  const appendText = (value: string) => {
    if (textTarget) text += value;
  };

  parser.on('doctype', () => {
    throw new MarcImportError('MARCXML_DOCTYPE', 'MARCXML files containing a DOCTYPE are not accepted.');
  });
  parser.on('error', (error) => {
    throw new MarcImportError('MARCXML_INVALID', `Invalid MARCXML: ${error.message}`);
  });
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.on('opentag', (tag) => {
    switch (tag.local) {
      case 'record':
        if (builder) throw new MarcImportError('MARCXML_NESTED_RECORD', 'MARCXML records cannot be nested.');
        if (records.length >= maxRecords) throw new MarcImportError('MARC_RECORD_LIMIT', `The file contains more than ${maxRecords.toLocaleString()} records.`);
        builder = { fields: {}, indicators: {} };
        break;
      case 'leader':
        if (builder) startText('leader');
        break;
      case 'controlfield':
        if (!builder) break;
        controlTag = attribute(tag, 'tag') ?? '';
        startText('controlfield');
        break;
      case 'datafield':
        if (!builder) break;
        dataTag = attribute(tag, 'tag') ?? '';
        dataIndicators = `${attribute(tag, 'ind1') ?? ' '}${attribute(tag, 'ind2') ?? ' '}`;
        dataSubfields = [];
        break;
      case 'subfield':
        if (!builder || !dataTag) break;
        subfieldCode = attribute(tag, 'code') ?? '';
        startText('subfield');
        break;
    }
  });
  parser.on('closetag', (tag) => {
    if (!builder && tag.local !== 'record') return;
    switch (tag.local) {
      case 'leader':
        if (builder) builder.leader = text;
        textTarget = undefined;
        break;
      case 'controlfield':
        if (!/^\d{3}$/.test(controlTag)) throw new MarcImportError('MARCXML_TAG', `Invalid MARC control-field tag "${controlTag}".`);
        addField(builder!, controlTag, text);
        controlTag = '';
        textTarget = undefined;
        break;
      case 'subfield':
        if (!/^[a-z0-9]$/i.test(subfieldCode)) throw new MarcImportError('MARCXML_SUBFIELD', `Invalid MARC subfield code "${subfieldCode}".`);
        dataSubfields.push({ code: subfieldCode, value: text });
        subfieldCode = '';
        textTarget = undefined;
        break;
      case 'datafield':
        if (!/^\d{3}$/.test(dataTag)) throw new MarcImportError('MARCXML_TAG', `Invalid MARC data-field tag "${dataTag}".`);
        addField(builder!, dataTag, dataSubfields.map((item) => `^${item.code}${item.value}`).join(''), dataIndicators);
        dataTag = '';
        dataSubfields = [];
        break;
      case 'record':
        if (!builder) break;
        if (!builder.leader) warnings.push({ code: 'MARC_LEADER_MISSING', message: 'Record has no MARC leader.', record: records.length + 1 });
        else if (builder.leader.length !== 24) warnings.push({ code: 'MARC_LEADER_LENGTH', message: `MARC leader has ${builder.leader.length} characters instead of 24.`, record: records.length + 1 });
        records.push(finishRecord(builder, records.length + 1, 'marcxml'));
        builder = undefined;
        break;
    }
  });

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunkSize = 256 * 1024;
  try {
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, data.length);
      parser.write(decoder.decode(data.subarray(offset, end), { stream: end < data.length }));
      options.onProgress?.(end, data.length);
    }
    parser.close();
  } catch (error) {
    if (error instanceof MarcImportError) throw error;
    const message = error instanceof Error ? error.message : 'Unknown XML parsing error.';
    throw new MarcImportError('MARCXML_INVALID', `Invalid UTF-8 MARCXML: ${message}`);
  }
  if (!records.length) throw new MarcImportError('MARC_NO_RECORDS', 'The MARCXML file contains no records.');
  return { format: 'marcxml', records, warnings };
}

function ascii(data: Uint8Array, start: number, end: number): string {
  let value = '';
  for (let index = start; index < end; index++) value += String.fromCharCode(data[index]);
  return value;
}

function decimal(data: Uint8Array, start: number, length: number, label: string): number {
  const value = ascii(data, start, start + length);
  if (!/^\d+$/.test(value)) throw new MarcImportError('ISO2709_NUMBER', `Invalid ${label} "${value}".`);
  return Number(value);
}

function decodeField(data: Uint8Array, utf8: boolean, recordNumber: number): string {
  if (!utf8 && data.some((byte) => byte > 0x7f)) {
    throw new MarcImportError('MARC8_UNSUPPORTED', `Record ${recordNumber.toLocaleString()} uses MARC-8 characters. Convert it to UTF-8 MARC or MARCXML before importing.`);
  }
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'ascii', { fatal: true }).decode(data);
  } catch {
    throw new MarcImportError('ISO2709_ENCODING', `Record ${recordNumber.toLocaleString()} contains invalid ${utf8 ? 'UTF-8' : 'ASCII'} data.`);
  }
}

function parseIsoRecord(data: Uint8Array, offset: number, recordLength: number, recordNumber: number, mfn: number): IsisRecord {
  if (recordLength < 25 || recordLength > 99_999) throw new MarcImportError('ISO2709_LENGTH', `Record ${recordNumber.toLocaleString()} declares an invalid length of ${recordLength}.`);
  if (data[offset + recordLength - 1] !== 0x1d) throw new MarcImportError('ISO2709_TERMINATOR', `Record ${recordNumber.toLocaleString()} has no record terminator.`);
  const leader = ascii(data, offset, offset + 24);
  const baseAddress = decimal(data, offset + 12, 5, 'base address');
  if (baseAddress <= 24 || baseAddress >= recordLength) throw new MarcImportError('ISO2709_BASE_ADDRESS', `Record ${recordNumber.toLocaleString()} has an invalid base address.`);
  const lengthWidth = Number(leader[20]);
  const positionWidth = Number(leader[21]);
  const implementationWidth = Number(leader[22]);
  const entryWidth = 3 + lengthWidth + positionWidth + implementationWidth;
  if (!lengthWidth || !positionWidth || entryWidth < 5) throw new MarcImportError('ISO2709_ENTRY_MAP', `Record ${recordNumber.toLocaleString()} has an invalid directory entry map.`);
  const directoryLength = baseAddress - 25;
  if (directoryLength < 0 || directoryLength % entryWidth !== 0 || data[offset + baseAddress - 1] !== 0x1e) {
    throw new MarcImportError('ISO2709_DIRECTORY', `Record ${recordNumber.toLocaleString()} has an invalid directory.`);
  }

  const utf8 = leader[9] === 'a';
  const indicatorCount = Number(leader[10]);
  const subfieldCodeLength = Number(leader[11]);
  if (!Number.isInteger(indicatorCount) || !Number.isInteger(subfieldCodeLength) || subfieldCodeLength < 2) {
    throw new MarcImportError('ISO2709_IDENTIFIERS', `Record ${recordNumber.toLocaleString()} has invalid indicator or subfield lengths.`);
  }
  const builder: RecordBuilder = { leader, fields: {}, indicators: {} };

  for (let directoryOffset = offset + 24; directoryOffset < offset + baseAddress - 1; directoryOffset += entryWidth) {
    const tag = ascii(data, directoryOffset, directoryOffset + 3);
    if (!/^\d{3}$/.test(tag)) throw new MarcImportError('ISO2709_TAG', `Record ${recordNumber.toLocaleString()} contains invalid tag "${tag}".`);
    const fieldLength = decimal(data, directoryOffset + 3, lengthWidth, 'field length');
    const fieldPosition = decimal(data, directoryOffset + 3 + lengthWidth, positionWidth, 'field position');
    const fieldStart = offset + baseAddress + fieldPosition;
    const fieldEnd = fieldStart + fieldLength;
    if (fieldLength < 1 || fieldEnd > offset + recordLength - 1 || data[fieldEnd - 1] !== 0x1e) {
      throw new MarcImportError('ISO2709_FIELD', `Record ${recordNumber.toLocaleString()} contains an invalid ${tag} field boundary.`);
    }
    const field = data.subarray(fieldStart, fieldEnd - 1);
    if (tag.startsWith('00')) {
      addField(builder, tag, decodeField(field, utf8, recordNumber));
      continue;
    }
    if (field.length < indicatorCount) throw new MarcImportError('ISO2709_FIELD', `Record ${recordNumber.toLocaleString()} field ${tag} is shorter than its indicators.`);
    const indicators = ascii(field, 0, indicatorCount).padEnd(2, ' ').slice(0, 2);
    const values: string[] = [];
    let cursor = indicatorCount;
    while (cursor < field.length) {
      if (field[cursor] !== 0x1f || cursor + subfieldCodeLength > field.length) {
        throw new MarcImportError('ISO2709_SUBFIELD', `Record ${recordNumber.toLocaleString()} field ${tag} has invalid subfield data.`);
      }
      const code = ascii(field, cursor + 1, cursor + subfieldCodeLength);
      cursor += subfieldCodeLength;
      const next = field.indexOf(0x1f, cursor);
      const end = next < 0 ? field.length : next;
      values.push(`^${code}${decodeField(field.subarray(cursor, end), utf8, recordNumber)}`);
      cursor = end;
    }
    addField(builder, tag, values.join(''), indicators);
  }
  return finishRecord(builder, mfn, 'iso2709');
}

export function parseIso2709(data: Uint8Array, options: MarcImportOptions = {}): MarcImportResult {
  const maxRecords = options.maxRecords ?? MAX_IMPORT_RECORDS;
  const records: IsisRecord[] = [];
  const warnings: MarcImportWarning[] = [];
  let offset = 0;
  let inputRecords = 0;
  while (offset < data.length) {
    while (offset < data.length && [0x09, 0x0a, 0x0d, 0x20].includes(data[offset])) offset++;
    if (offset >= data.length) break;
    if (inputRecords >= maxRecords) throw new MarcImportError('MARC_RECORD_LIMIT', `The file contains more than ${maxRecords.toLocaleString()} records.`);
    if (offset + 5 > data.length) throw new MarcImportError('ISO2709_TRUNCATED', 'The final ISO2709 record is truncated.');
    const recordLength = decimal(data, offset, 5, 'record length');
    inputRecords++;
    if (recordLength < 25 || recordLength > 99_999) throw new MarcImportError('ISO2709_LENGTH', `Record ${inputRecords} declares an invalid length of ${recordLength}.`);
    if (offset + recordLength > data.length) throw new MarcImportError('ISO2709_TRUNCATED', `Record ${inputRecords} extends beyond the end of the file.`);
    try {
      records.push(parseIsoRecord(data, offset, recordLength, inputRecords, records.length + 1));
    } catch (error) {
      if (error instanceof MarcImportError && error.code === 'MARC8_UNSUPPORTED') throw error;
      const message = error instanceof Error ? error.message : 'Unknown ISO2709 record error.';
      warnings.push({ code: error instanceof MarcImportError ? error.code : 'ISO2709_RECORD', message, record: inputRecords, offset });
    }
    offset += recordLength;
    options.onProgress?.(offset, data.length);
  }
  if (!records.length) {
    const detail = warnings[0]?.message;
    throw new MarcImportError('MARC_NO_RECORDS', detail ? `No valid ISO2709 records were found. ${detail}` : 'The ISO2709 file contains no records.');
  }
  return { format: 'iso2709', records, warnings };
}

export function detectMarcFormat(data: Uint8Array, fileName = ''): MarcImportFormat {
  const extension = fileName.toLowerCase().split('.').pop();
  let offset = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? 3 : 0;
  while (offset < data.length && [0x09, 0x0a, 0x0d, 0x20].includes(data[offset])) offset++;
  if (data[offset] === 0x3c || extension === 'xml' || extension === 'marcxml') return 'marcxml';
  if (/^\d{5}$/.test(ascii(data, offset, Math.min(offset + 5, data.length)))) return 'iso2709';
  if (['mrc', 'marc', 'iso', 'iso2709'].includes(extension ?? '')) return 'iso2709';
  throw new MarcImportError('MARC_FORMAT', 'The file is not recognizable as MARCXML or ISO2709 MARC.');
}

export function parseMarcData(data: Uint8Array, fileName = '', options: MarcImportOptions = {}): MarcImportResult {
  if (data.length > MAX_IMPORT_BYTES) throw new MarcImportError('MARC_FILE_SIZE', `The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB import limit.`);
  const format = detectMarcFormat(data, fileName);
  return format === 'marcxml' ? parseMarcXml(data, options) : parseIso2709(data, options);
}
