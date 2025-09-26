-- Create location types management table
CREATE TABLE IF NOT EXISTS location_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_code VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert comprehensive location types
INSERT INTO location_types (type_code, display_name, category, description, icon, sort_order) VALUES
-- Corporate/Business (1-10)
('headquarters', 'Headquarters', 'corporate', 'Main corporate headquarters', 'building-2', 1),
('branch', 'Branch Office', 'corporate', 'Branch or satellite office', 'building', 2),
('office', 'Office', 'corporate', 'General office location', 'briefcase', 3),
('satellite_office', 'Satellite Office', 'corporate', 'Remote satellite office', 'radio', 4),
('regional_office', 'Regional Office', 'corporate', 'Regional headquarters', 'map-pin', 5),

-- Educational (11-20)
('school', 'School', 'educational', 'Elementary, middle, or high school', 'graduation-cap', 11),
('university', 'University', 'educational', 'University or college campus', 'school', 12),
('college', 'College', 'educational', 'College campus', 'book-open', 13),
('library', 'Library', 'educational', 'Public or private library', 'library', 14),
('training_center', 'Training Center', 'educational', 'Professional training facility', 'users', 15),

-- Religious (21-25)
('church', 'Church', 'religious', 'Christian church', 'church', 21),
('synagogue', 'Synagogue', 'religious', 'Jewish synagogue', 'star', 22),
('mosque', 'Mosque', 'religious', 'Islamic mosque', 'moon', 23),
('temple', 'Temple', 'religious', 'Hindu, Buddhist, or other temple', 'temple', 24),
('religious_center', 'Religious Center', 'religious', 'Multi-faith or community religious center', 'heart', 25),

-- Government/Military (31-40)
('military_base', 'Military Base', 'government', 'Military installation or base', 'shield', 31),
('government_office', 'Government Office', 'government', 'Government administrative office', 'landmark', 32),
('courthouse', 'Courthouse', 'government', 'Court or judicial facility', 'scale', 33),
('city_hall', 'City Hall', 'government', 'Municipal government building', 'flag', 34),
('fire_station', 'Fire Station', 'government', 'Fire department facility', 'flame', 35),
('police_station', 'Police Station', 'government', 'Police department facility', 'shield-check', 36),

-- Healthcare (41-50)
('hospital', 'Hospital', 'healthcare', 'Hospital or medical center', 'activity', 41),
('clinic', 'Clinic', 'healthcare', 'Medical clinic', 'stethoscope', 42),
('medical_office', 'Medical Office', 'healthcare', 'Medical practice office', 'user-check', 43),
('urgent_care', 'Urgent Care', 'healthcare', 'Urgent care facility', 'zap', 44),
('nursing_home', 'Nursing Home', 'healthcare', 'Senior care facility', 'home', 45),

-- Hospitality/Food Service (51-60)
('restaurant', 'Restaurant', 'hospitality', 'Restaurant or dining establishment', 'utensils', 51),
('kitchen', 'Kitchen', 'hospitality', 'Commercial kitchen facility', 'chef-hat', 52),
('cafeteria', 'Cafeteria', 'hospitality', 'Cafeteria or food court', 'coffee', 53),
('hotel', 'Hotel', 'hospitality', 'Hotel or lodging facility', 'bed', 54),
('resort', 'Resort', 'hospitality', 'Resort or vacation facility', 'sun', 55),
('banquet_hall', 'Banquet Hall', 'hospitality', 'Event or banquet facility', 'calendar', 56),

-- Cultural/Entertainment (61-70)
('museum', 'Museum', 'cultural', 'Museum or cultural institution', 'landmark', 61),
('gallery', 'Gallery', 'cultural', 'Art gallery or exhibition space', 'image', 62),
('theater', 'Theater', 'cultural', 'Theater or performance venue', 'play', 63),
('community_center', 'Community Center', 'cultural', 'Community recreation center', 'users', 64),
('recreation_center', 'Recreation Center', 'cultural', 'Sports and recreation facility', 'dumbbell', 65),

-- Industrial/Warehouse (71-80)
('warehouse', 'Warehouse', 'industrial', 'Storage and distribution warehouse', 'package', 71),
('factory', 'Factory', 'industrial', 'Manufacturing facility', 'cog', 72),
('distribution_center', 'Distribution Center', 'industrial', 'Distribution and logistics center', 'truck', 73),
('manufacturing_plant', 'Manufacturing Plant', 'industrial', 'Large-scale manufacturing facility', 'settings', 74),

-- Retail/Commercial (81-90)
('retail_store', 'Retail Store', 'retail', 'Retail store or shop', 'shopping-bag', 81),
('shopping_center', 'Shopping Center', 'retail', 'Shopping center or plaza', 'shopping-cart', 82),
('mall', 'Mall', 'retail', 'Shopping mall', 'store', 83),
('showroom', 'Showroom', 'retail', 'Product showroom or display center', 'eye', 84),

-- Residential/Community (91-95)
('apartment_complex', 'Apartment Complex', 'residential', 'Multi-unit residential complex', 'building-2', 91),
('senior_living', 'Senior Living', 'residential', 'Senior living community', 'heart', 92),
('dormitory', 'Dormitory', 'residential', 'Student housing or dormitory', 'home', 93),
('community_housing', 'Community Housing', 'residential', 'Community or public housing', 'users', 94),

-- Technology/Other (96-99)
('datacenter', 'Data Center', 'technology', 'Data center or server facility', 'server', 96),
('other', 'Other', 'other', 'Other type of location', 'more-horizontal', 99);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_location_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_location_types_updated_at
    BEFORE UPDATE ON location_types
    FOR EACH ROW
    EXECUTE FUNCTION update_location_types_updated_at();

-- Create view for easy location type queries
CREATE OR REPLACE VIEW v_location_types AS
SELECT
    id,
    type_code,
    display_name,
    category,
    description,
    icon,
    is_active,
    sort_order,
    created_at,
    updated_at
FROM location_types
WHERE is_active = true
ORDER BY sort_order, display_name;