import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
export async function testStorage(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(await readFile('drizzle/0000_contractledger.sql','utf8'));
 const DB={prepare(sql){const p={args:[],bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){const r=sqlite.prepare(sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}};return p;},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const p of statements)results.push(await p.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const files=new Map(),BUCKET={async put(k,data){files.set(k,new Uint8Array(data));},async get(k){const data=files.get(k);return data?{async arrayBuffer(){return data.slice().buffer;}}:null;}};
 return {DB,BUCKET,sqlite,files};
}
