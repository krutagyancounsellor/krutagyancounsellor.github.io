---
date: {{ dateFormat "2006-01-02T15:04:05Z07:00" .Date }}
lastmod: {{ dateFormat "2006-01-02T15:04:05Z07:00" .Date }}
draft: true
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
---
