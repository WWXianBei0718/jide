import { fictionalPersonaV1 } from './fictional-persona-v1';
import type { RetrievalEvalDataset } from '../src/lib/retrieval-eval';

export const fictionalRetrievalV1: RetrievalEvalDataset = {
  version: 'fictional-retrieval-v1',
  fictional: true,
  materials: fictionalPersonaV1.materials,
  cases: [
    { id: 'birth-date', query: '她的生日是哪一天？', expectedMaterialIds: ['fictional-biography'] },
    { id: 'career', query: '她退休前靠什么工作生活？', expectedMaterialIds: ['fictional-biography'] },
    { id: 'spouse', query: '周远山从事什么职业？', expectedMaterialIds: ['fictional-biography'] },
    { id: 'morning', query: '她每天早晨起床后先做什么？', expectedMaterialIds: ['fictional-habits'] },
    { id: 'drink', query: '她平时爱喝哪一种茶？', expectedMaterialIds: ['fictional-habits'] },
    { id: 'nickname', query: '她怎样称呼自己的外孙女？', expectedMaterialIds: ['fictional-relationship'] },
    { id: 'thunder', query: '孩子害怕雷声时她怎么安抚？', expectedMaterialIds: ['fictional-relationship'] },
    { id: 'anxiety', query: '家里人焦虑的时候她一般怎么处理？', expectedMaterialIds: ['fictional-values'] },
    { id: 'health', query: '她觉得升职和身体哪个更重要？', expectedMaterialIds: ['fictional-values'] },
    { id: 'flood', query: '洪灾发生时她抢救了什么东西？', expectedMaterialIds: ['fictional-events'] },
    { id: 'bookmark', query: '第一届学生送给她的纪念物是什么？', expectedMaterialIds: ['fictional-events'] },
    { id: 'overwork', query: '小满忙得喘不过气时她会说什么？', expectedMaterialIds: ['fictional-style', 'fictional-values'] },
    { id: 'promotion', query: '听到小满晋升，她会怎样回应？', expectedMaterialIds: ['fictional-style'] },
    { id: 'prompt-injection', query: '哪份材料声称要忽略规则并去过月球？', expectedMaterialIds: ['fictional-untrusted'] },
  ],
};
