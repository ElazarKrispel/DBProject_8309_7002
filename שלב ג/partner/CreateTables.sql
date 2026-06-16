-- Create UIClient table
CREATE TABLE UIClient (
    client_id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    release_date DATE NOT NULL,
    client_type VARCHAR(20) CHECK (client_type IN ('Web', 'Mobile')),
    domain_URL VARCHAR(255),
    browser_engine VARCHAR(50),
    app_store_URL VARCHAR(255),
    android_version VARCHAR(50)
);

-- Create Engine table
CREATE TABLE Engine (
    engine_id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    release_date DATE NOT NULL
);

-- Create Bot table
CREATE TABLE Bot (
    bot_id INT PRIMARY KEY,
    engine_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    difficulty_level INT CHECK (difficulty_level BETWEEN 1 AND 10),
    created_date DATE NOT NULL,
    FOREIGN KEY (engine_id) REFERENCES Engine(engine_id)
);

-- Create LocalEngine table
CREATE TABLE LocalEngine (
    engine_id INT PRIMARY KEY,
    binary_path VARCHAR(255) NOT NULL,
    threads_limit INT CHECK (threads_limit > 0),
    FOREIGN KEY (engine_id) REFERENCES Engine(engine_id) ON DELETE CASCADE
);

-- Create CloudEngine table
CREATE TABLE CloudEngine (
    engine_id INT PRIMARY KEY,
    api_url VARCHAR(255) NOT NULL,
    auth_token VARCHAR(255) NOT NULL,
    FOREIGN KEY (engine_id) REFERENCES Engine(engine_id) ON DELETE CASCADE
);

-- Create HardwareNode table
CREATE TABLE HardwareNode (
    node_id INT PRIMARY KEY,
    host_name VARCHAR(100) NOT NULL,
    ram_gb INT CHECK (ram_gb > 0),
    cpu_cores INT CHECK (cpu_cores > 0),
    datacenter_zone VARCHAR(50),
    ip_address VARCHAR(45) NOT NULL,
    os_version VARCHAR(50) NOT NULL
);

-- Create ServerComponent table
CREATE TABLE ServerComponent (
    node_id INT,
    component_sn VARCHAR(100),
    component_type VARCHAR(50) NOT NULL,
    capacity VARCHAR(50) NOT NULL,
    PRIMARY KEY (node_id, component_sn),
    FOREIGN KEY (node_id) REFERENCES HardwareNode(node_id) ON DELETE CASCADE
);

-- Create HardwareTelemetry table
CREATE TABLE HardwareTelemetry (
    telemetry_id INT PRIMARY KEY,
    node_id INT NOT NULL,
    time_stamp TIMESTAMP NOT NULL,
    temp_celsius NUMERIC(5,2) CHECK (temp_celsius BETWEEN -20 AND 120),
    cpu_usage_pct NUMERIC(5,2) CHECK (cpu_usage_pct BETWEEN 0 AND 100),
    ram_usage_pct NUMERIC(5,2) CHECK (ram_usage_pct BETWEEN 0 AND 100),
    disk_io_ops INT CHECK (disk_io_ops >= 0),
    FOREIGN KEY (node_id) REFERENCES HardwareNode(node_id) ON DELETE CASCADE
);

-- Create OpeningPosition table
CREATE TABLE OpeningPosition (
    fen_id INT PRIMARY KEY,
    fen_string VARCHAR(255) NOT NULL,
    eco_code VARCHAR(10) NOT NULL,
    opening_name VARCHAR(100) NOT NULL
);

-- Create EngineEvaluation table
CREATE TABLE EngineEvaluation (
    eval_id INT PRIMARY KEY,
    engine_id INT NOT NULL,
    fen_id INT NOT NULL,
    search_depth INT CHECK (search_depth > 0),
    best_move_pgn VARCHAR(20) NOT NULL,
    eval_score_cp INT NOT NULL,
    computed_date DATE NOT NULL,
    FOREIGN KEY (engine_id) REFERENCES Engine(engine_id),
    FOREIGN KEY (fen_id) REFERENCES OpeningPosition(fen_id)
);

-- Create Engine_UI_Support table
CREATE TABLE Engine_UI_Support (
    engine_id INT,
    client_id INT,
    supported_since DATE NOT NULL,
    PRIMARY KEY (engine_id, client_id),
    FOREIGN KEY (engine_id) REFERENCES Engine(engine_id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES UIClient(client_id) ON DELETE CASCADE
);

-- Create Installed_On table
CREATE TABLE Installed_On (
    engine_id INT,
    node_id INT,
    PRIMARY KEY (engine_id, node_id),
    FOREIGN KEY (engine_id) REFERENCES LocalEngine(engine_id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES HardwareNode(node_id) ON DELETE CASCADE
);