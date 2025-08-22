# Distributed Task Coordination MVP

A small demo of coordinating task distribution between many clients. Concepts
used in this demo:

- Distributed locking
- Leader election
- Consistent hashing (as one strategy to distribute tasks among clients)

[etcd](https://etcd.io/) is used as coordination service.

# Difference from queue-based message-brokers like BullMQ

In BullMQ, tasks are randomly distributed to whichever worker claims it first.
This system performs leader election, and the leader distributes tasks to workers
using application-level logic, which allows more flexibility.
