import {readFile} from 'node:fs/promises';
import {PrintData} from '@pao-at-office/reports-web';

export async function createPrintData(){
  const definition=JSON.parse(await readFile(new URL('./report.prepdj',import.meta.url),'utf8'));
  return new PrintData()
    .setDefinition(definition)
    .pageStart()
    .setValue('Message','Node.jsから、あっという間に帳票出力')
    .pageEnd()
    .toObject();
}
