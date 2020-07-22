/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Metadata } from "./types";

type Language = "python" | "julia" | "r" | "sage";

// I think the default points in official nbgrader is 0, but I find that very confusing
// and it forces you to think.  Since partial credit with autograder doesn't exist, just
// defaulting to 1 is probably often a much better choice.
const DEFAULT_POINTS: number = 1;

interface CelltypeInfo {
  title: string; // human readable title for this type of cell
  student_title: string;
  student_tip: string;
  value: string; // what type of cell it is
  grade: boolean; // is it graded?
  locked: boolean; // is it locked?
  solution: boolean; // is it a solution?
  task: boolean; // is it a task?
  link: string; // link to some html help (the nbgrader docs)
  hover: string; // hover text that is helpful about this cell type (summary of nbgrader docs)
  points?: number; // default number of points
  icon?: string; // icon that would make sense for this type of cell
  code_only?: boolean; // only code cells can be set to this type
  markdown_only?: boolean; // only markdown cells can be set to this type
  template?: { [language in Language]?: string } | string;
}

const PY_TEST = `
# [Modify the tests below for your own problem]
# Check that squares returns the correct output for several inputs:
from nose.tools import assert_equal
assert_equal(squares(1), [1])
assert_equal(squares(2), [1, 4])

# Check that squares raises an error for invalid input:
from nose.tools import assert_raises
assert_raises(ValueError, squares, 0)
assert_raises(ValueError, squares, -1)

### BEGIN HIDDEN TESTS
# students will NOT see these extra tests
assert_equal(squares(10), [1, 4, 9, 16, 25, 36, 49, 64, 81, 100])
### END HIDDEN TESTS
`;

const PY_ANSWER = `
def squares(n):  # modify function name and parameters
    """
    Compute the squares of the numbers from 1 to n.  [replace with function description]
    """
    ### BEGIN SOLUTION
    # Put correct code here.  This code is removed for the student version, but is used
    # to confirm that your tests are valid.
    if n < 1: raise ValueError("n must be at least 1")
    return [i**2 for i in range(1, n+1)]
    ### END SOLUTION`;

const PY_MANUAL_ANSWER = `
def foo(a, b):
    """Return a + b."""
    ### BEGIN SOLUTION
    return a + b
    ### END SOLUTION`;

const R_TEST = `
testthat::test_that("squares function works as expected", {
  # test the result is an integer vector of length 10
  testthat::expect_vector(squares(10), ptype = integer(), size = 10)
  # check for a specific n=3
  testthat::expect_equal(squares(3), c(1, 4, 9))
  # use 'tolerance' when there are slight floating point errors
  testthat::expect_equal(squares(2), c(1, 4.000001), tolerance = 0.002)
})

# make sure the error contains the word 'positive' for a negative n
testthat::test_that("squares function raises errors", {
  testthat::expect_error(squares(-1), "*positive*", ignore.case = TRUE)
})

### BEGIN HIDDEN TESTS

# students will NOT see this extra test
testthat::expect_equal(squares(10), c(1, 4, 9, 16, 25, 36, 49, 64, 81, 100))
### END HIDDEN TESTS`;

const R_ANSWER = `
squares <- function(n) {
  # Compute the squares of the numbers from 1 to n.

  ### BEGIN SOLUTION

  # Put correct code here. This code is removed for the student version, but is
  # used to confirm that your tests are valid.
  if (n <= 0) {
    stop("n must be positive")
  }
  x <- 1:n
  return(x * x)

  ### END SOLUTION
}`;

const R_MANUAL_ANSWER = `
foo <- function(a, b) {
  # Returns a + b

  ### BEGIN SOLUTION
  return(a + b)
  ### END SOLUTION
}`;

const JULIA_TEST = `
using Test

@testset "squares function works as expected" begin
    # test the result is an integer vector of length 10
    s10 = squares(10)
    @test size(s10) == (10,)
    @test typeof(s10) == Array{Int64,1}
    # check for a specific n=3
    @test squares(3) == [1, 4, 9]
    # use \approx with a tolerance when there are slight floating point errors
    @test squares(2) ≈ [1, 4.000001]   atol = 0.002
end

# check if an ArgumentError is raised for a negative n
@testset "squares function raises errors" begin
  @test_throws ArgumentError squares(-1)
end

### BEGIN HIDDEN TESTS
# students will NOT see this extra test
@test squares(10) == [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]
### END HIDDEN TESTS`;

const JULIA_ANSWER = `
function squares(n)
    # Compute the squares of the numbers from 1 to n.

    ### BEGIN SOLUTION
    # Put correct code here. This code is removed for the student version, but is
    # used to confirm that your tests are valid.
    if (n <= 0)
        throw(ArgumentError("n must be positive"))
    end
    return [i^2 for i in 1:n]
    ### END SOLUTION
end`;

const JULIA_MANUAL_ANSWER = `
function foo(a, b)
    # Compute the sum of a and b.

    ### BEGIN SOLUTION
    return a + b
    ### END SOLUTION
end`;

const TASK_TEMPLATE = `
Describe the task here, e.g., "Process the data and create
a plot to illustrate your results."

=== BEGIN MARK SCHEME ===

Describe how you will grade the task here.

=== END MARK SCHEME ===
`;

export const CELLTYPE_INFO_LIST: CelltypeInfo[] = [
  {
    title: "-",
    student_title: "",
    student_tip: "",
    value: "",
    grade: false,
    locked: false,
    solution: false,
    task: false,
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#developing-assignments-with-the-assignment-toolbar",
    hover:
      "This is a normal Jupyter cell, which won't be graded and doesn't contain any special autograding meaning.",
  },
  {
    title: "Manually graded answer",
    student_title: "Manually graded answer",
    student_tip:
      "Type your answer in this cell.  It will be manually graded by a person later.",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#manually-graded-answer-cells",
    hover:
      "This cell will contain an answer that must be manually graded by a human grader.",
    value: "manual",
    icon: "book-reader",
    grade: true,
    locked: false,
    solution: true,
    task: false,
    points: DEFAULT_POINTS,
    template: {
      python: PY_MANUAL_ANSWER,
      r: R_MANUAL_ANSWER,
      julia: JULIA_MANUAL_ANSWER,
    },
  },
  {
    // The official docs so this is only for markdown cells only and that is all that makes sense,
    // but the official implementation in nbgrader
    // makes it available for both task and code cells, which is surely a bug.   I'm doing it
    // right and also complained here:
    //     https://github.com/jupyter/nbgrader/pull/984#issuecomment-539255861
    title: "Manually graded task",
    student_title: "Manually graded task",
    student_tip:
      "This is a task that you must perform.  Instead of editing this cell, you'll be creating or editing some other cells, which will be manually graded by a person.",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#manually-graded-task-cells",
    hover: "",
    value: "task",
    icon: "tasks",
    grade: false,
    locked: true,
    solution: false,
    task: true,
    template: TASK_TEMPLATE,
    points: DEFAULT_POINTS,
    markdown_only: true,
  },
  {
    title: "Autograded answer",
    student_title: "Answer that will be automatically graded below",
    student_tip:
      "Type your answer in this cell and evaluate it.  Use tests in cells below to check that your code probably works.",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#autograded-answer-cells",
    hover:
      "This cell contains code that is part of a student's answer to a question.  This code typically gets run before some other 'Autograder tests' cell.",
    value: "auto",
    icon: "magic",
    grade: false,
    locked: false,
    solution: true,
    task: false,
    code_only: true,
    template: {
      python: PY_ANSWER,
      r: R_ANSWER,
      julia: JULIA_ANSWER,
    },
  },
  {
    title: "Autograder tests",
    student_title: "Test your code from above here",
    student_tip:
      "You should have typed some code above and evaluated it.  Use the tests here to check that your code probably works.  Note that your teacher may also run additional tests not included here.",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#autograder-tests-cells",
    hover:
      "This cell contains test code that will be run to automatically grade the answer to a question. This answer is typically contained in an 'Autograded answer' cell.",
    value: "test",
    icon: "check",
    grade: true,
    locked: true,
    solution: false,
    task: false,
    points: DEFAULT_POINTS,
    code_only: true,
    template: {
      python: PY_TEST,
      r: R_TEST,
      julia: JULIA_TEST,
    },
  },
  {
    title: "Readonly",
    student_title: "Readonly",
    student_tip:
      "This is setup or explanatory code for your assignment.  It is readonly, so you should not need to change it.",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#read-only-cells",
    hover:
      "This cell is marked as read only.  This makes it difficult for the student to change, and during instructor autograding, the original version of this cell will be placed here in case it was somehow changed by the student.",
    value: "readonly",
    icon: "lock",
    grade: false,
    locked: true,
    solution: false,
    task: false,
  },
];

export const CELLTYPE_INFO_MAP: { [value: string]: CelltypeInfo } = {};
for (const x of CELLTYPE_INFO_LIST) {
  if (CELLTYPE_INFO_MAP[x.value] != null) {
    throw Error("bug -- values must be unique");
  }
  CELLTYPE_INFO_MAP[x.value] = x;
}

// I could implement this with another map hardcoded
// in Javascript, but instead use a function with a cache
// since it's more flexible.
const value_cache: { [key: string]: string } = {};
export function state_to_value(state: Metadata): string {
  const grade: boolean = !!state.grade;
  const locked: boolean = !!state.locked;
  const solution: boolean = !!state.solution;
  const task: boolean = !!state.task;
  if (grade === false && solution === false && task === false) {
    // special case: either nothing or readonly
    return locked ? "readonly" : "";
  }

  // other 7 possibilities for grade/solution/task state:
  const key = JSON.stringify({ grade, solution, task });
  if (value_cache[key] != undefined) return value_cache[key];
  for (const x of CELLTYPE_INFO_LIST) {
    if (x.grade == grade && x.solution == solution && x.task == task) {
      value_cache[key] = x.value;
      return x.value;
    }
  }
  throw Error(`invalid state - "${key}"`);
}

export function value_to_state(value: string): Metadata {
  const x = CELLTYPE_INFO_MAP[value];
  if (x == null) {
    throw Error(`unknown value "${value}"`);
  }
  return {
    grade: x.grade,
    locked: x.locked,
    solution: x.solution,
    task: x.task,
    points: x.points,
  };
}

/*
A template for a cell, which helps the instructor not have to copy/paste
or memorize the syntax of nbgrader...
*/
export function value_to_template_content(
  value: string,
  language: string,
  type: string
): string {
  if (value == "manual" && type != "code") {
    // special case
    return "YOUR ANSWER HERE";
  }

  const x = CELLTYPE_INFO_MAP[value];
  if (x == null) {
    throw Error(`unknown value "${value}"`);
  }
  const template = x.template;
  if (template == null) return "";
  if (typeof template == "string") return template.trim();
  if (language == "sage" && template[language] == null) {
    language = "python";
  }
  const content = template[language];
  return content == null ? "" : content.trim();
}
