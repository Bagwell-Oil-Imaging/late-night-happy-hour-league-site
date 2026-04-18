---
description: "SECURITY.md OS security topics, section structure, and update triggers"
paths: ["SECURITY.md"]
---

# SECURITY.md Update Rules

## Purpose

SECURITY.md defines the security policy, supported versions, and vulnerability reporting process. For an OS project, security is paramount.

## Required Sections (maintain this order)

1. **Security Policy** - Overview of project's security stance
2. **Supported Versions** - Table of versions receiving security updates
3. **Reporting a Vulnerability** - How to privately report security issues
4. **Security Considerations** - OS-specific security features and design choices
5. **Disclosure Policy** - Timeline and process for public disclosure

## When to Update SECURITY.md

- A new version is released (update Supported Versions table)
- Security-related features are added (memory protection, access control, etc.)
- The vulnerability reporting process changes
- Security-relevant architecture decisions are made
- A security advisory is issued or resolved

## OS-Specific Security Topics to Document

As features are implemented, document security aspects of:
- Memory protection and isolation (paging, segmentation)
- Privilege levels and ring transitions
- Interrupt handling and validation
- System call interface security
- Boot chain integrity
- Driver isolation and I/O permissions
- Stack protection (guard pages, canaries)

## Style Guidelines

- Be specific about reporting channels (email, issue tracker, etc.)
- Include expected response timelines
- Never include actual vulnerability details in this file
- Reference CVE process if applicable
