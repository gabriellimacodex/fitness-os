-- PRD 21 Option A: ordinary role needs schema USAGE to exercise SELECT/INSERT
-- grants from 0006. Without this, SET ROLE cannot resolve table relations.
GRANT USAGE ON SCHEMA public TO fitness_os_privacy_ordinary;
