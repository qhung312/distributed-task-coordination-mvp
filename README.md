# Distributed Task Coordination MVP

A small demo of coordinating task distribution between many clients. Concepts
used in this demo:

- Distributed locking
- Leader election
- Consistent hashing (as one strategy to distribute tasks among clients)

[etcd](https://etcd.io/) is used as coordination service.
