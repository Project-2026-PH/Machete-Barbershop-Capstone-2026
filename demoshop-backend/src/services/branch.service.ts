import { branchRepository } from '../repositories/branch.repository';

export class BranchService {
    async getPublicBranches(name:string) {
        // If you needed to format the branch names or filter them by complex
        // business rules, that logic would go right here.
        return await branchRepository.findAllPublicBranches(name);
    }
}

export const branchService = new BranchService();