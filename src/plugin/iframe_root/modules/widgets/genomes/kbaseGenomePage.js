/**
 * Shows general gene info.
 * Such as its name, synonyms, annotation, publications, etc.
 *
 * Gene "instance" info (e.g. coordinates on a particular strain's genome)
 * is in a different widget.
 */
define([
    'jquery',
    'uuid',
    'kb_common/html',
    'kb_service/client/workspace',
    'kb_service/utils',
    // 'kb_sdk_clients/AssemblyAPI/dev/AssemblyAPIClient',
    'kb_lib/jsonRpc/dynamicServiceClient',
    'kbaseUI/widget/legacy/widget',
    'widgets/genomes/kbaseGenomeWideOverview',
    'widgets/genomes/kbaseLitWidget',
    'widgets/genomes/kbaseGenomeWideTaxonomy',
    'widgets/genomes/kbaseGenomeWideAssemblyAnnotation'
], function ($, Uuid, html, Workspace, serviceUtils, DynamicServiceClient) {
    'use strict';
    $.KBWidget({
        name: 'KBaseGenomePage',
        parent: 'kbaseWidget',
        version: '1.0.0',
        options: {
            genomeID: null,
            workspaceID: null,
            ver: null
        },
        init: function (options) {
            this._super(options);
            this.init_view();
            this.fetchGenome();
            this.assemblyAPI = new DynamicServiceClient({
                url: this.runtime.getConfig('services.service_wizard.url'),
                module: 'AssemblyAPI',
                auth: {
                    token: this.runtime.service('session').getAuthToken()
                }
            });
            return this;
        },
        fetchGenome: function () {
            var _this = this,
                scope = {
                    ws: this.options.workspaceID,
                    id: this.options.genomeID,
                    ver: this.options.ver
                },
                objId = scope.ws + '/' + scope.id,
                genome_fields = [
                    'contigset_ref',
                    'assembly_ref',
                    'domain',
                    'dna_size',
                    'scientific_name',
                    'source',
                    'source_id',
                    'genetic_code',
                    'id',
                    'contig_ids',
                    'contig_lengths',
                    'gc_content',
                    'taxonomy'
                ],
                feature_fields = ['type', 'id', 'contig_id', 'location', 'function', 'functions'];

            this.genomeAnnotationAPI = new DynamicServiceClient({
                url: this.runtime.getConfig('services.service_wizard.url'),
                module: 'GenomeAnnotationAPI',
                auth: {
                    token: this.runtime.service('session').getAuthToken()
                }
            });

            // this.ga_api = new GenomeAnnotationAPI({
            //     url: this.runtime.getConfig('services.service_wizard.url'),
            //     auth: {
            //         token: this.runtime.service('session').getAuthToken()
            //     },
            //     version: 'release'
            // });

            // this.asm_api = new AssemblyAPI({
            //     url: this.runtime.getConfig('services.service_wizard.url'),
            //     auth: {
            //         token: this.runtime.service('session').getAuthToken()
            //     },
            //     version: 'release'
            // });

            if (this.options.ver) {
                objId += '/' + this.options.ver;
            }
            this.genomeAnnotationAPI
                .callFunc('get_genome_v1', [
                    {
                        genomes: [{ ref: objId }],
                        included_fields: genome_fields
                    }
                ])
                .spread(function (result) {
                    const genomeObject = result.genomes[0];
                    let assembly_ref = null;
                    const gnm = genomeObject.data;
                    let metadata = genomeObject.info[10];
                    const add_stats = function (obj, size, gc, num_contigs) {
                            obj.dna_size = size;
                            obj.gc_content = gc;
                            obj.num_contigs = num_contigs;
                        },
                        assembly_error = function (data, error) {
                            console.error('Error loading contigset subdata', data, error);
                        };

                    if (gnm.hasOwnProperty('contigset_ref')) {
                        assembly_ref = gnm.contigset_ref;
                    } else if (gnm.hasOwnProperty('assembly_ref')) {
                        assembly_ref = gnm.assembly_ref;
                    } else {
                        // no assembly reference found, error
                        assembly_error(gnm, 'No assembly reference present!');
                    }

                    genomeObject.objectInfo = serviceUtils.objectInfoToObject(genomeObject.info);

                    // We avoid getting features for big genomes.
                    if (gnm.domain === 'Eukaryota' || gnm.domain === 'Plant') {
                        // TODO: DANGER: sortof relying upon metadata structure!
                        if (metadata && metadata['GC content'] && metadata['Size'] && metadata['Number contigs']) {
                            add_stats(gnm, metadata['Size'], metadata['GC content'], metadata['Number contigs']);
                            _this.render(genomeObject);
                        } else {
                            return (
                                _this.assemblyAPI
                                    .callFunc('get_stats', [assembly_ref])
                                    // .get_stats(assembly_ref)
                                    .spread(function (stats) {
                                        add_stats(gnm, stats.dna_size, stats.gc_content, stats.num_contigs);
                                        _this.render(genomeObject);
                                        return null;
                                    })
                                    .catch(function (error) {
                                        assembly_error(gnm, error);
                                    })
                            );
                        }
                        return null;
                    } else {
                        genome_fields.push('features');
                        // we do a second call here to get the features, see above.
                        _this.genomeAnnotationAPI
                            .callFunc('get_genome_v1', [
                                {
                                    genomes: [{ ref: objId }],
                                    included_fields: genome_fields,
                                    included_feature_fields: feature_fields
                                }
                            ])
                            .spread(function (data) {
                                const features = data.genomes[0].data.features;
                                genomeObject.data.features = features;
                                metadata = genomeObject.info[10];

                                // This stuff is duplicated from above -- they can be combined.

                                if (
                                    metadata &&
                                    metadata['GC content'] &&
                                    metadata['Size'] &&
                                    metadata['Number contigs']
                                ) {
                                    add_stats(
                                        gnm,
                                        metadata['Size'],
                                        metadata['GC content'],
                                        metadata['Number contigs']
                                    );
                                    _this.render(genomeObject);
                                } else if (!gnm.hasOwnProperty('dna_size')) {
                                    return (
                                        _this.assemblyAPI
                                            .callFunc('get_stats', [assembly_ref])
                                            // .get_stats(assembly_ref)
                                            .spread(function (stats) {
                                                add_stats(gnm, stats.dna_size, stats.gc_content, stats.num_contigs);
                                                _this.render(genomeObject);
                                            })
                                            .catch(function (error) {
                                                assembly_error(gnm, error);
                                            })
                                    );
                                } else {
                                    _this.render(genomeObject);
                                }

                                return null;
                            })
                            .catch(function (error) {
                                _this.showError(_this.view.panels[0].inner_div, error);
                                console.error(error);
                            });
                    }

                    return null;
                })
                .catch(function (error) {
                    console.error('Error loading genome subdata');
                    console.error(error);
                    _this.showError(_this.view.panels[0].inner_div, error);
                    _this.view.panels[1].inner_div.empty();
                    _this.view.panels[2].inner_div.empty();
                    _this.view.panels[3].inner_div.empty();
                });
        },
        fetchAssembly: function (genomeInfo, callback) {
            var assembly_ref = null,
                gnm = genomeInfo.data;

            if (gnm.hasOwnProperty('contigset_ref')) {
                assembly_ref = gnm.contigset_ref;
            } else if (gnm.hasOwnProperty('assembly_ref')) {
                assembly_ref = gnm.assembly_ref;
            }

            this.assemblyAPI
                .callFunc('get_contig_ids', [assembly_ref])
                .spread((contig_ids) => {
                    Object.defineProperties(gnm, {
                        contig_ids: {
                            __proto__: null,
                            value: contig_ids,
                            writable: false,
                            enumerable: true
                        }
                    });
                    return this.assemblyAPI
                        .callFunc('get_contig_lengths', [assembly_ref, contig_ids])
                        .spread((contig_lengths) => {
                            Object.defineProperties(gnm, {
                                contig_lengths: {
                                    __proto__: null,
                                    value: contig_lengths,
                                    writable: false,
                                    enumerable: true
                                }
                            });

                            callback(genomeInfo);
                            return null;
                        })
                        .catch((error) => {
                            this.showError(this.view.panels[3].inner_div, error);
                        });
                })
                .catch((error) => {
                    this.showError(this.view.panels[3].inner_div, error);
                });
        },
        init_view: function () {
            var cell_html = '<div>';
            var body = '<div data-element="body">';

            this.view = {
                panels: [
                    {
                        label: 'Overview',
                        name: 'overview',
                        outer_div: $(cell_html),
                        inner_div: $(body)
                    },
                    {
                        order: 2,
                        label: 'Publications',
                        name: 'publications',
                        outer_div: $(cell_html),
                        inner_div: $(body)
                    },
                    {
                        order: 3,
                        label: 'Taxonomy',
                        name: 'taxonomy',
                        outer_div: $(cell_html),
                        inner_div: $(body)
                    },
                    {
                        order: 4,
                        label: 'Assembly and Annotation',
                        name: 'assembly-annotation',
                        outer_div: $(cell_html),
                        inner_div: $(body)
                    }
                ]
            };
            var that = this;
            this.view.panels.forEach(function (panel) {
                that.makeWidgetPanel(panel.outer_div, panel.label, panel.name, panel.inner_div);
                that.$elem.append(panel.outer_div);
                panel.inner_div.html(html.loading('Loading...'));
            });
        },
        render: function (genomeInfo) {
            var _this = this,
                scope = {
                    ws: this.options.workspaceID,
                    id: this.options.genomeID,
                    ver: this.options.ver
                },
                panelError = function (p, e) {
                    console.error(e);
                    _this.showError(p, e.message);
                };

            _this.view.panels[0].inner_div.empty();
            try {
                _this.view.panels[0].inner_div.KBaseGenomeWideOverview({
                    genomeID: scope.id,
                    workspaceID: scope.ws,
                    genomeInfo: genomeInfo,
                    runtime: _this.runtime
                });
            } catch (e) {
                panelError(_this.view.panels[0].inner_div, e);
            }

            var searchTerm = '';
            if (genomeInfo && genomeInfo.data['scientific_name']) {
                searchTerm = genomeInfo.data['scientific_name'];
            }
            _this.view.panels[1].inner_div.empty();
            try {
                _this.view.panels[1].inner_div.KBaseLitWidget({
                    literature: searchTerm,
                    genomeInfo: genomeInfo,
                    runtime: _this.runtime
                });
            } catch (e) {
                panelError(_this.view.panels[1].inner_div, e);
            }

            /*
            _this.view.panels[2].inner_div.empty();
            try {
                _this.view.panels[2].inner_div.KBaseGenomeWideCommunity({genomeID: scope.id, workspaceID: scope.ws, kbCache: kb, genomeInfo: genomeInfo});
            }
            catch (e) {
                panelError(_this.view.panels[2].inner_div, e);
            }
            */

            _this.view.panels[2].inner_div.empty();
            try {
                _this.view.panels[2].inner_div.KBaseGenomeWideTaxonomy({
                    genomeID: scope.id,
                    workspaceID: scope.ws,
                    genomeInfo: genomeInfo,
                    runtime: _this.runtime
                });
            } catch (e) {
                panelError(_this.view.panels[2].inner_div, e);
            }

            if (
                (genomeInfo && genomeInfo.data['domain'] === 'Eukaryota') ||
                (genomeInfo && genomeInfo.data['domain'] === 'Plant')
            ) {
                _this.view.panels[3].inner_div.empty();
                _this.view.panels[3].inner_div.append(
                    'Browsing Eukaryotic Genome Features is not supported at this time.'
                );
            } else {
                var gnm = genomeInfo.data,
                    assembly_callback = function (genomeInfo) {
                        _this.view.panels[3].inner_div.empty();
                        try {
                            _this.view.panels[3].inner_div.KBaseGenomeWideAssemAnnot({
                                genomeID: scope.id,
                                workspaceID: scope.ws,
                                ver: scope.ver,
                                genomeInfo: genomeInfo,
                                runtime: _this.runtime
                            });
                        } catch (e) {
                            panelError(_this.view.panels[3].inner_div, e);
                        }
                    };

                if (gnm.contig_ids && gnm.contig_lengths && gnm.contig_ids.length === gnm.contig_lengths.length) {
                    assembly_callback(genomeInfo);
                } else {
                    _this.fetchAssembly(genomeInfo, assembly_callback);
                }
            }
        },
        // TODO: This is
        makeWidgetPanel: function ($panel, title, name, $widgetDiv) {
            var id = new Uuid(4).format();
            $panel.append(
                $(
                    '<div class="panel-group" id="accordion_' +
                        id +
                        '" role="tablist" aria-multiselectable="true" data-panel="' +
                        name +
                        '">'
                ).append(
                    $('<div class="panel panel-default kb-widget">')
                        .append(
                            '' +
                                '<div class="panel-heading" role="tab" id="heading_' +
                                id +
                                '">' +
                                '<h4 class="panel-title">' +
                                '<span data-toggle="collapse" data-parent="#accordion_' +
                                id +
                                '" data-target="#collapse_' +
                                id +
                                '" aria-expanded="false" aria-controls="collapse_' +
                                id +
                                '" style="cursor:pointer;" data-element="title">' +
                                ' ' +
                                title +
                                '</span>' +
                                '</h4>' +
                                '</div>'
                        )
                        .append(
                            $(
                                '<div id="collapse_' +
                                    id +
                                    '" class="panel-collapse collapse in" role="tabpanel" aria-labelledby="heading_' +
                                    id +
                                    '" area-expanded="true">'
                            ).append($('<div class="panel-body">').append($widgetDiv))
                        )
                )
            );
        },
        getData: function () {
            return {
                type: 'Genome Page',
                id: this.options.genomeID,
                workspace: this.options.workspaceID,
                title: 'Genome Page'
            };
        },
        showError: function (panel, e) {
            panel.empty();
            const $err = $('<div>')
                .addClass('alert alert-danger')
                .append(
                    $('<div>')
                        .addClass('text-danger')
                        .css('font-weight', 'bold')
                        .text('Error')
                )
                .append($('<p>').text(JSON.stringify(e.message)))
                .append($('<div>').text(JSON.stringify(e)));
            panel.append($err);
        }
    });
});
