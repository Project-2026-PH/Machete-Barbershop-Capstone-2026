import { QueryResult } from 'pg';
import db from '../db';
import {Branch} from "@demoshop/shared-types";

export class BranchRepository {

    async findAllPublicBranches(name?: string): Promise<Branch[]> {
        const query = 'SELECT branch_id, name, address, image_url AS image FROM branches WHERE ($1::text IS NULL OR name = $1) LIMIT 20';
        const result: QueryResult<Branch> = await db.query(query, [name || null]);
        return result.rows;
    }
}

export const branchRepository = new BranchRepository();