# Enzo assesment

The .env needs the following vars

```
.env

OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
```

### Install and Run

`npm i`

`npx tsx .`

## Follow up questions

---

1. What approach would you take to monitor and improve the system's performance over time?

To monitor and improve the system, I would have a team of nurses to verify the results. The key to improve the system is to allow the nurses to trace and debug incorrect outputs so they can pin point which agent failed and gather context for why it might have failed. Another key aspect is that the agent system employed is simple and easy for the nurses to mentally model. The MAC-II system presented in the paper is very easy to conceptualize, a nurse could quickly be trained to understand how the agents should interact and how to verify each output. As long as the nurses have a sensible admin portal with the right data in the right places, they’ll effectively distill the feedback needed to improve the system.

For monitoring, its also important to understand the consequences of false positives and false negatives and establish an acceptable threshold for each error type. If one has greater consequences, I would use more resources to detect and correct those. Once the system operates within the error thresholds, I would continue to have the team of nurses verify randomly sampled cases.

2. What safeguards would you put in place to prevent incorrect or inappropriate code generation / hallucination?

Hallucinations are really tricky but there are a couple strategies I would use to deter them. The first is by enforcing that the evidence for each code is verbatim so it can be verified and the selected codes are valid. The MAC-II approach has multiple anti-hallucination tatics built in — it focuses on very small steps, it validates the codes multiple times and it asks the models for reasoning. These methods will help, but the only true solution with the current state of LLMs is to have a system for RLHF like I described above.
