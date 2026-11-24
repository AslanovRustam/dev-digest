import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./dependency-checker.cases.js";

describeWorkflow("dependency-checker", () => runWorkflowCases(cases));
