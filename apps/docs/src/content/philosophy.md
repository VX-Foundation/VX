# The VX Manifesto

*"Applications are compiled from intent, not assembled from APIs."*

## Introduction

VX was created from a simple observation:

Modern frontend development has become increasingly complex, not because user interfaces are inherently difficult, but because developers are responsible for solving problems that should belong to the compiler.

For years, frameworks have introduced new abstractions to compensate for the limitations of previous ones: Virtual DOM, Hooks, Signals, Effects, Memoization, Hydration, Schedulers, Dependency arrays.

Every generation solved existing problems while introducing new concepts developers had to learn.

VX believes there is a better approach. Instead of continuously adding runtime abstractions, **VX moves intelligence into the compiler.**

The result is a language that allows developers to express application intent while the compiler determines the most efficient implementation. VX is not designed to be another JavaScript framework. VX is designed to become the programming language of user interfaces.

## Our Mission

Build the most intelligent frontend compiler ever created.

The developer should never think about rendering algorithms, dependency tracking, scheduling, or performance optimizations. Those responsibilities belong to VX.

## Our Vision

We believe the future of frontend development is compiler-driven. Applications should describe what they are, not how they should update themselves. 

The compiler should understand the entire application before it ever executes. It should know:
- Every component
- Every dependency
- Every event
- Every state transition
- Every render path
- Every optimization opportunity

Only then should code be generated.

## Core Philosophy

### The Compiler Is the Platform
The compiler is not a build tool. The compiler is the platform. Every VX feature is designed around compile-time intelligence. If a problem can be solved during compilation, it should never exist at runtime.

### Applications Describe Intent
Developers should describe behavior. Never implementation. 
VX applications answer: *What exists? What changes? What depends on what? What should happen?*
The compiler answers: *How updates occur. How rendering happens. How memory is managed. How events propagate. How code is optimized.*

### Runtime Is the Last Resort
Runtime exists only because browsers execute applications. Everything that can be removed from runtime should be removed. Every byte shipped to the browser must justify its existence.

### Simplicity Through Intelligence
The language should remain simple. The compiler should become smarter. Complexity belongs inside the platform. Not inside application code.

### Static Knowledge Beats Runtime Discovery
Modern frameworks spend runtime discovering information that already existed during compilation. VX believes this is unnecessary. The compiler already knows the component hierarchy, dependency graph, event graph, render tree, static expressions, and dead branches. This information should be used before the application executes.

### Components Are Architecture
Components are not functions or classes. They are architectural units that describe pieces of an application. The compiler determines how those units should execute.

### Reactivity Is a Language Feature
State management is not a library. Reactivity is not an API. Reactivity is part of the language itself. Dependencies should be inferred automatically. Developers should never manually connect reactive graphs.

### Performance Is Architecture
Performance is not an optimization phase. Performance begins when the language is designed. Every syntax feature has a runtime cost. Every runtime feature has a maintenance cost. VX refuses to add abstractions whose long-term cost exceeds their value.

## What VX Believes

- The compiler should perform more work than the developer.
- Runtime should be as small as technically possible.
- Applications should describe intent rather than implementation.
- Static analysis is more valuable than runtime heuristics.
- Predictability is more important than clever abstractions.
- One obvious solution is better than many equivalent APIs.
- Architecture should remain stable for decades.
- Tooling is part of the framework, not an optional ecosystem.

## What VX Avoids

VX intentionally avoids features that increase cognitive complexity. VX avoids:
- Multiple APIs solving the same problem.
- Runtime dependency tracking when static analysis is possible.
- Manual optimization APIs.
- Excessive configuration.
- Hidden magic that changes application behavior.
- Boilerplate.
- Framework-specific patterns that leak into business logic.
- APIs that exist only because of JavaScript limitations.

## What VX Will Never Do

- Require developers to manually optimize rendering.
- Require dependency arrays.
- Require manual memoization.
- Introduce APIs that duplicate existing behavior.
- Prioritize trends over architecture.
- Lock developers into proprietary tooling.
- Break architectural consistency for convenience.
- Add features without compiler justification.

Every feature must strengthen the language. If it does not, it does not belong in VX.

## What VX Always Prioritizes

Every decision must improve at least one of the following: Developer Experience, Compiler Intelligence, Predictability, Performance, Maintainability, Readability, Static Analysis, Architectural Consistency, or Long-Term Stability.

## The VX Principle

Every new feature must answer one question: **Can the compiler solve this automatically?**
If the answer is yes, the developer should never have to think about it.

## The VX Rule

Complexity belongs inside the compiler. Never inside the application.

## The VX Promise

Applications built with VX should feel as if they were handcrafted by an expert engineer. The developer writes clear, declarative code. The compiler transforms it into an optimized application. Developers focus on solving problems. VX focuses on solving everything else.

## The Future

VX is not trying to replace JavaScript. VX is trying to replace the way developers think about building user interfaces. The future is not another framework. The future is a language that understands applications before they run.

That language is VX.
