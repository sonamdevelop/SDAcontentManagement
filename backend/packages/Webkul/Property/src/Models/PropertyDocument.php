<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Webkul\Property\Contracts\PropertyDocument as PropertyDocumentContract;

class PropertyDocument extends Model implements PropertyDocumentContract
{
    use SoftDeletes;

    protected $table = 'property_documents';

    protected $fillable = ['property_id', 'uploaded_by', 'title', 'category', 'description', 'original_name', 'mime_type', 'size_bytes', 'sha256', 'path'];

    protected $hidden = ['path', 'deleted_at'];

    protected $casts = ['property_id' => 'integer', 'uploaded_by' => 'integer', 'size_bytes' => 'integer'];
}
